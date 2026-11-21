import type { DraftPersistPort, RedirectPort } from "../../ports/auth.js";
import type { ProviderInfo } from "../../ports/config.js";
import type { PreferencesPort } from "../../ports/preferences.js";
import type { BeginSignIn } from "./CompleteSignIn.js";
import type { DraftStore } from "./DraftStore.js";
import type { ListProviders } from "./ListProviders.js";

export const PROVIDER_PREF = "afs.provider";
export const AUTH_PATHS = ["/sign-in", "/signed-out", "/auth/callback"] as const;

export type BootDecision =
  | { kind: "auth-page" }
  | { kind: "callback" }
  | { kind: "silent"; provider: ProviderInfo }
  | { kind: "sign-in"; returnTo: string };

/** Only same-origin absolute paths are accepted as a return route (no open redirect). */
export function safeReturnTo(raw: string | null | undefined): string {
  return raw && /^\/(?!\/|\\)/.test(raw) ? raw : "/";
}

/**
 * Start-up with no session (WEB-US-7.6): restore carried drafts, then for an app route try a top-level
 * `prompt=none` sign-in with the remembered provider so a reload returns to the same route without the
 * IdP page; otherwise go to the sign-in page.
 */
export class Boot {
  constructor(
    private readonly providers: ListProviders,
    private readonly begin: BeginSignIn,
    private readonly prefs: PreferencesPort,
    private readonly drafts: DraftStore,
    private readonly persisted: DraftPersistPort,
    private readonly redirect: RedirectPort,
  ) {}

  async execute(location: { pathname: string; search: string }): Promise<BootDecision> {
    this.drafts.restore(this.persisted.take());
    if (location.pathname === "/auth/callback") return { kind: "callback" };
    if (location.pathname === "/sign-in" || location.pathname === "/signed-out")
      return { kind: "auth-page" };
    const returnTo = `${location.pathname}${location.search}`;
    const remembered = this.prefs.get(PROVIDER_PREF);
    if (remembered) {
      const { providers } = await this.providers.execute();
      const provider = providers.find((p) => p.id === remembered);
      if (provider) {
        await this.begin.execute(provider, returnTo, "none");
        return { kind: "silent", provider };
      }
    }
    this.redirect.replaceUrl(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    return { kind: "sign-in", returnTo };
  }
}
