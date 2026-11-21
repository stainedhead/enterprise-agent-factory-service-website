import * as oauth from "oauth4webapi";
import {
  AuthError,
  type BeginOptions,
  type OidcPort,
  type SessionTokens,
} from "../../application/ports/auth.js";
import type { ProviderInfo } from "../../application/ports/config.js";
import type { FlowStore } from "../storage/SessionFlowStore.js";

export interface OidcClientOptions {
  readonly flows: FlowStore;
  readonly fetcher?: typeof fetch;
  /** Allow `http://` issuers: only for the local fake IdP in end-to-end tests. */
  readonly allowInsecure?: boolean;
  /** Hidden-frame timeout for silent renewal. */
  readonly frameTimeoutMs?: number;
  /** Creates the hidden frame element; tests substitute a plain element. */
  readonly createFrame?: () => HTMLIFrameElement;
}

const SCOPE = "openid profile email offline_access";
const INTERACTION = new Set([
  "login_required",
  "interaction_required",
  "consent_required",
  "account_selection_required",
]);

/** OIDC authorization code + PKCE (S256) with `oauth4webapi`. Tokens are returned, never stored. */
export class OidcClient implements OidcPort {
  readonly #flows: FlowStore;
  readonly #fetch: typeof fetch;
  readonly #insecure: boolean;
  readonly #frameTimeout: number;
  readonly #createFrame: () => HTMLIFrameElement;
  readonly #servers = new Map<string, Promise<oauth.AuthorizationServer>>();

  constructor(opts: OidcClientOptions) {
    this.#flows = opts.flows;
    this.#fetch = opts.fetcher ?? ((...a) => fetch(...a));
    this.#insecure = opts.allowInsecure ?? false;
    this.#frameTimeout = opts.frameTimeoutMs ?? 10_000;
    this.#createFrame = opts.createFrame ?? (() => document.createElement("iframe"));
  }

  #opts() {
    return {
      [oauth.customFetch]: (url: string, o: unknown) => this.#fetch(url, o as RequestInit),
      ...(this.#insecure && { [oauth.allowInsecureRequests]: true }),
    };
  }

  #discover(p: ProviderInfo): Promise<oauth.AuthorizationServer> {
    let s = this.#servers.get(p.issuerUrl);
    if (!s) {
      const issuer = new URL(p.issuerUrl);
      s = oauth
        .discoveryRequest(issuer, { ...this.#opts() })
        .then((r) => oauth.processDiscoveryResponse(issuer, r));
      this.#servers.set(p.issuerUrl, s);
      s.catch(() => this.#servers.delete(p.issuerUrl));
    }
    return s;
  }

  async begin(provider: ProviderInfo, opts: BeginOptions): Promise<string> {
    const as = await this.#discover(provider);
    if (!as.authorization_endpoint)
      throw new AuthError("exchange", "The provider has no authorization endpoint");
    const verifier = oauth.generateRandomCodeVerifier();
    const state = oauth.generateRandomState();
    const nonce = oauth.generateRandomNonce();
    const challenge = await oauth.calculatePKCECodeChallenge(verifier);
    this.#flows.put(state, {
      verifier,
      nonce,
      redirectUri: opts.redirectUri,
      returnTo: opts.returnTo,
      provider,
    });
    const url = new URL(as.authorization_endpoint);
    url.searchParams.set("client_id", provider.consoleClientId);
    url.searchParams.set("redirect_uri", opts.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (opts.prompt) url.searchParams.set("prompt", opts.prompt);
    return url.toString();
  }

  async complete(
    callbackUrl: string,
    now: number,
  ): Promise<{ tokens: SessionTokens; returnTo: string }> {
    const url = new URL(callbackUrl);
    const state = url.searchParams.get("state");
    const flow = state ? this.#flows.take(state) : undefined;
    if (!state || !flow)
      throw new AuthError(
        "state",
        "The sign-in response does not match a request from this browser",
      );
    const err = url.searchParams.get("error");
    if (err) {
      throw INTERACTION.has(err)
        ? new AuthError("interaction_required", "The provider needs you to sign in")
        : new AuthError("denied", `The provider refused sign-in (${err})`);
    }
    const client: oauth.Client = {
      client_id: flow.provider.consoleClientId,
      token_endpoint_auth_method: "none",
    };
    let result: oauth.TokenEndpointResponse;
    try {
      const as = await this.#discover(flow.provider);
      const params = oauth.validateAuthResponse(as, client, url, state);
      const res = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        oauth.None(),
        params,
        flow.redirectUri,
        flow.verifier,
        this.#opts(),
      );
      result = await oauth.processAuthorizationCodeResponse(as, client, res, {
        expectedNonce: flow.nonce,
        requireIdToken: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      throw new AuthError(
        /nonce/i.test(msg) ? "nonce" : "exchange",
        "Sign-in could not be completed",
      );
    }
    return { tokens: toTokens(result, flow.provider.id, now), returnTo: flow.returnTo };
  }

  async refresh(provider: ProviderInfo, refreshToken: string, now: number): Promise<SessionTokens> {
    const as = await this.#discover(provider);
    const client: oauth.Client = {
      client_id: provider.consoleClientId,
      token_endpoint_auth_method: "none",
    };
    try {
      const res = await oauth.refreshTokenGrantRequest(
        as,
        client,
        oauth.None(),
        refreshToken,
        this.#opts(),
      );
      return toTokens(await oauth.processRefreshTokenResponse(as, client, res), provider.id, now);
    } catch {
      throw new AuthError("exchange", "The session could not be renewed");
    }
  }

  async endSessionUrl(
    provider: ProviderInfo,
    idToken: string | undefined,
    postLogoutRedirectUri: string,
  ): Promise<string | undefined> {
    const as = await this.#discover(provider);
    if (!as.end_session_endpoint) return undefined;
    const url = new URL(as.end_session_endpoint);
    if (idToken) url.searchParams.set("id_token_hint", idToken);
    url.searchParams.set("client_id", provider.consoleClientId);
    url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
    return url.toString();
  }

  /**
   * Hidden-frame `prompt=none` renewal. The callback page, when loaded in a frame, posts its URL to the
   * parent (see `postCallbackToParent`); anything but a code response resolves undefined.
   */
  async renewInFrame(
    provider: ProviderInfo,
    redirectUri: string,
    now: number,
  ): Promise<SessionTokens | undefined> {
    const authorizeUrl = await this.begin(provider, { redirectUri, returnTo: "/", prompt: "none" });
    const callback = await this.#frame(authorizeUrl, new URL(redirectUri).origin);
    if (!callback) return undefined;
    try {
      return (await this.complete(callback, now)).tokens;
    } catch (e) {
      if (e instanceof AuthError && e.reason === "interaction_required") return undefined;
      throw e;
    }
  }

  #frame(authorizeUrl: string, origin: string): Promise<string | undefined> {
    return new Promise((resolve) => {
      const frame = this.#createFrame();
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.display = "none";
      const done = (v: string | undefined) => {
        clearTimeout(timer);
        window.removeEventListener("message", on);
        frame.remove();
        resolve(v);
      };
      const on = (e: MessageEvent) => {
        const d = e.data as { type?: unknown; url?: unknown } | null;
        if (e.origin === origin && d?.type === "afs-callback" && typeof d.url === "string")
          done(d.url);
      };
      const timer = setTimeout(() => done(undefined), this.#frameTimeout);
      window.addEventListener("message", on);
      frame.src = authorizeUrl;
      document.body.append(frame);
    });
  }
}

/** When the callback page runs inside the renewal frame, hands its URL to the parent. Returns true if it did. */
export function postCallbackToParent(win: Window = window): boolean {
  if (win.parent === win) return false;
  win.parent.postMessage({ type: "afs-callback", url: win.location.href }, win.location.origin);
  return true;
}

function toTokens(r: oauth.TokenEndpointResponse, providerId: string, now: number): SessionTokens {
  const ttl = typeof r.expires_in === "number" ? r.expires_in : 300;
  return {
    accessToken: r.access_token,
    ...(r.id_token && { idToken: r.id_token }),
    ...(r.refresh_token && { refreshToken: r.refresh_token }),
    expiresAt: now + ttl * 1000,
    providerId,
  };
}
