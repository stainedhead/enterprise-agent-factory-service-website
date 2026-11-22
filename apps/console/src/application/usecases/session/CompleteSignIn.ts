import type { ClockPort } from "../../ports/auth.js";
import { AuthError, type OidcPort, type RedirectPort } from "../../ports/auth.js";
import type { ProviderInfo, RuntimeConfig } from "../../ports/config.js";
import type { Session } from "./Session.js";

export type SignInOutcome =
  | { kind: "signed-in"; returnTo: string }
  /** The provider needs the user; `returnTo` is the route the flow was started for. */
  | { kind: "login-required"; returnTo: string }
  | { kind: "error"; error: AuthError };

/** Starts sign-in: redirects to the provider's authorize endpoint. */
export class BeginSignIn {
  constructor(
    private readonly oidc: OidcPort,
    private readonly redirect: RedirectPort,
    private readonly config: Pick<RuntimeConfig, "redirectUri">,
  ) {}

  async execute(
    provider: ProviderInfo,
    returnTo: string,
    prompt?: "none" | "login",
  ): Promise<void> {
    const url = await this.oidc.begin(provider, {
      redirectUri: this.config.redirectUri,
      returnTo,
      ...(prompt && { prompt }),
    });
    this.redirect.navigate(url);
  }
}

/** Completes the callback: validates state and nonce, exchanges the code, establishes the session. */
export class CompleteSignIn {
  constructor(
    private readonly oidc: OidcPort,
    private readonly session: Session,
    private readonly clock: ClockPort,
  ) {}

  async execute(callbackUrl: string): Promise<SignInOutcome> {
    try {
      const { tokens, returnTo } = await this.oidc.complete(callbackUrl, this.clock.now());
      this.session.establish(tokens);
      return { kind: "signed-in", returnTo };
    } catch (e) {
      if (e instanceof AuthError) {
        return e.reason === "interaction_required"
          ? { kind: "login-required", returnTo: e.returnTo ?? "/" }
          : { kind: "error", error: e };
      }
      return { kind: "error", error: new AuthError("exchange", "Sign-in could not be completed") };
    }
  }
}
