import type { DraftPersistPort } from "../../ports/auth.js";
import type { ProviderInfo } from "../../ports/config.js";
import type { BeginSignIn } from "./CompleteSignIn.js";
import type { DraftStore } from "./DraftStore.js";

/**
 * Re-authentication after the session expired (WEB-US-7.7): non-secret drafts ride through the redirect
 * in `sessionStorage` (DV-9) and come back with the user to the same route. Secret values are never drafts.
 */
export class ReAuthenticate {
  constructor(
    private readonly begin: BeginSignIn,
    private readonly drafts: DraftStore,
    private readonly persisted: DraftPersistPort,
  ) {}

  async execute(provider: ProviderInfo, returnTo: string): Promise<void> {
    this.persisted.write(this.drafts.snapshot());
    await this.begin.execute(provider, returnTo);
  }
}
