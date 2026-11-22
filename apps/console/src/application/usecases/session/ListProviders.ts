import type { ProvidersPort } from "../../ports/auth.js";
import type { ProviderInfo } from "../../ports/config.js";

/** Lists sign-in providers, falling back to `providersFallback` when the API cannot be reached. */
export class ListProviders {
  constructor(
    private readonly providers: ProvidersPort,
    private readonly fallback: readonly ProviderInfo[],
  ) {}

  async execute(): Promise<{ providers: readonly ProviderInfo[]; usedFallback: boolean }> {
    try {
      const providers = await this.providers.list();
      if (providers.length > 0) return { providers, usedFallback: false };
    } catch {
      // fall through to the fallback list
    }
    return { providers: this.fallback, usedFallback: true };
  }
}
