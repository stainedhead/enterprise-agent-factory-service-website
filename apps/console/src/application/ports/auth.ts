import type { ProviderInfo } from "./config.js";

/** Tokens held in memory only. `expiresAt` is epoch ms computed from the response's `expires_in`. */
export interface SessionTokens {
  readonly accessToken: string;
  readonly idToken?: string;
  readonly refreshToken?: string;
  readonly expiresAt: number;
  readonly providerId: string;
}

/** Lists enabled sign-in providers (`ListSignInProviders`, public). */
export interface ProvidersPort {
  list(): Promise<readonly ProviderInfo[]>;
}

export type AuthRefusal =
  | "state"
  | "nonce"
  | "denied"
  | "interaction_required"
  | "exchange"
  | "no_flow"
  | "storage";

/** Sign-in failed or was refused; the console shows an error page, never a half-signed-in state. */
export class AuthError extends Error {
  readonly reason: AuthRefusal;
  /** For `interaction_required`: the route the flow was started for, so sign-in can return to it. */
  readonly returnTo: string | undefined;
  constructor(reason: AuthRefusal, message: string, returnTo?: string) {
    super(message);
    this.name = "AuthError";
    this.reason = reason;
    this.returnTo = returnTo;
  }
}

export interface BeginOptions {
  readonly redirectUri: string;
  readonly returnTo: string;
  /** `none` for silent sign-in; `login` to force the IdP page. */
  readonly prompt?: "none" | "login";
}

/** OIDC authorization code + PKCE against one provider. */
export interface OidcPort {
  /** Builds the authorize URL and remembers the verifier, nonce and return route until the callback. */
  begin(provider: ProviderInfo, opts: BeginOptions): Promise<string>;
  /** Validates `state` and `nonce`, exchanges the code and forgets the flow. Throws {@link AuthError}. */
  complete(callbackUrl: string, now: number): Promise<{ tokens: SessionTokens; returnTo: string }>;
  /** Refresh-token grant. */
  refresh(provider: ProviderInfo, refreshToken: string, now: number): Promise<SessionTokens>;
  /** URL that ends the provider session, or undefined when the provider has none. */
  endSessionUrl(
    provider: ProviderInfo,
    idToken: string | undefined,
    postLogoutRedirectUri: string,
  ): Promise<string | undefined>;
  /** Silent renewal in a hidden frame (`prompt=none`); resolves undefined when the provider needs the user. */
  renewInFrame(
    provider: ProviderInfo,
    redirectUri: string,
    now: number,
  ): Promise<SessionTokens | undefined>;
}

/** Navigation side effects, so use cases stay free of `window`. */
export interface RedirectPort {
  navigate(url: string): void;
  replaceUrl(path: string): void;
}

/**
 * The only messages the session channel carries, and they carry no data: `signout` ends the session in
 * every tab; `activity` says "there was input in some tab" so every tab's idle monitor resets (FR-005).
 */
export type SessionMessage = "signout" | "activity";

/** Cross-tab session messages (`BroadcastChannel("afs-session")`). Unknown messages are never delivered. */
export interface SessionChannelPort {
  post(message: SessionMessage): void;
  subscribe(handler: (message: SessionMessage) => void): () => void;
}

export interface ClockPort {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Carries non-secret drafts across a top-level re-authentication redirect. */
export interface DraftPersistPort {
  write(snapshot: Record<string, Record<string, string>>): void;
  take(): Record<string, Record<string, string>>;
  /** Removes the persisted copy (sign-out): nothing typed survives it. */
  clear(): void;
}
