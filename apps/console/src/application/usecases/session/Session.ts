import {
  AuthError,
  type ClockPort,
  type OidcPort,
  type SessionChannelPort,
  type SessionTokens,
} from "../../ports/auth.js";
import type { ProviderInfo } from "../../ports/config.js";

export type SessionState = "signed-out" | "active" | "expired";

export interface SessionDeps {
  readonly oidc: OidcPort;
  readonly clock: ClockPort;
  readonly channel: SessionChannelPort;
  readonly redirectUri: string;
  readonly providerById: (id: string) => ProviderInfo | undefined;
  /** Clears cached server state on sign-out (not on expiry, which must keep the page). */
  readonly clearCaches?: () => void;
}

/** Renew this long before the access token expires. */
export const RENEW_LEAD_MS = 60_000;

/**
 * The signed-in session. Tokens live only in this object's memory (WEB-US-7.5): never in storage, URLs
 * or logs. Renews silently at `expiresAt − 60 s`, expires when renewal needs the user, and signs out in
 * every tab through the session channel.
 */
export class Session {
  #tokens: SessionTokens | undefined;
  #state: SessionState = "signed-out";
  #timer: unknown;
  #inflight: Promise<SessionTokens | undefined> | undefined;
  readonly #listeners = new Set<(s: SessionState) => void>();
  readonly #unsubscribe: () => void;

  constructor(private readonly deps: SessionDeps) {
    this.#unsubscribe = deps.channel.subscribe((m) => {
      if (m === "signout") this.#clear("signed-out");
    });
  }

  get state(): SessionState {
    return this.#state;
  }
  get providerId(): string | undefined {
    return this.#tokens?.providerId;
  }
  get idToken(): string | undefined {
    return this.#tokens?.idToken;
  }

  onChange(fn: (s: SessionState) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** Starts a session from a completed sign-in. */
  establish(tokens: SessionTokens): void {
    this.#tokens = tokens;
    this.#set("active");
    this.#schedule();
  }

  /** The bearer for the next request; renews first when forced or inside the renew lead. */
  async accessToken(opts: { forceRefresh: boolean }): Promise<string> {
    const t = this.#tokens;
    if (!t) throw new AuthError("no_flow", "There is no signed-in session");
    if (opts.forceRefresh || t.expiresAt - this.deps.clock.now() <= RENEW_LEAD_MS) {
      const renewed = await this.#renew();
      if (!renewed) throw new AuthError("interaction_required", "The session has expired");
      return renewed.accessToken;
    }
    return t.accessToken;
  }

  /** Ends the session here and in other tabs; returns the provider's end-session URL when it has one. */
  async signOut(postLogoutRedirectUri: string): Promise<string | undefined> {
    const t = this.#tokens;
    const provider = t ? this.deps.providerById(t.providerId) : undefined;
    let url: string | undefined;
    if (t && provider)
      url = await this.deps.oidc
        .endSessionUrl(provider, t.idToken, postLogoutRedirectUri)
        .catch(() => undefined);
    this.#clear("signed-out");
    this.deps.channel.post("signout");
    return url;
  }

  /** Marks the session expired (renewal failed or the API said 401 twice); tokens are dropped. */
  expire(): void {
    this.#clear("expired");
  }

  dispose(): void {
    this.#unsubscribe();
    this.#cancel();
    this.#listeners.clear();
  }

  #renew(): Promise<SessionTokens | undefined> {
    this.#inflight ??= this.#doRenew().finally(() => {
      this.#inflight = undefined;
    });
    return this.#inflight;
  }

  async #doRenew(): Promise<SessionTokens | undefined> {
    const t = this.#tokens;
    if (!t) return undefined;
    const provider = this.deps.providerById(t.providerId);
    if (!provider) {
      this.expire();
      return undefined;
    }
    const now = this.deps.clock.now();
    let next: SessionTokens | undefined;
    try {
      next = t.refreshToken
        ? await this.deps.oidc.refresh(provider, t.refreshToken, now)
        : await this.deps.oidc.renewInFrame(provider, this.deps.redirectUri, now);
    } catch {
      next = undefined;
    }
    if (!next) {
      if (this.#tokens === t) this.expire();
      return undefined;
    }
    if (this.#tokens !== t) return undefined; // signed out while renewing
    const refreshToken = next.refreshToken ?? t.refreshToken;
    this.#tokens = {
      ...next,
      ...(refreshToken !== undefined && { refreshToken }),
      providerId: t.providerId,
    };
    this.#schedule();
    return this.#tokens;
  }

  #schedule(): void {
    this.#cancel();
    const t = this.#tokens;
    if (!t) return;
    const wait = Math.max(0, t.expiresAt - RENEW_LEAD_MS - this.deps.clock.now());
    this.#timer = this.deps.clock.setTimeout(() => {
      void this.#renew();
    }, wait);
  }

  #cancel(): void {
    if (this.#timer !== undefined) this.deps.clock.clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #clear(state: SessionState): void {
    this.#cancel();
    this.#tokens = undefined;
    // Expiry keeps cached data and the page as they are so work in progress survives re-authentication.
    if (state === "signed-out") this.deps.clearCaches?.();
    this.#set(state);
  }

  #set(s: SessionState): void {
    if (this.#state === s) return;
    this.#state = s;
    for (const fn of [...this.#listeners]) fn(s);
  }
}
