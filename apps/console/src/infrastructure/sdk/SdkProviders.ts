import { type AfsClient, auth } from "@afs/sdk";
import type { ProvidersPort } from "../../application/ports/auth.js";
import type { ProviderInfo } from "../../application/ports/config.js";

/** `ListSignInProviders` (public, no token): the providers the console may offer. */
export class SdkProviders implements ProvidersPort {
  constructor(private readonly client: AfsClient) {}

  async list(): Promise<readonly ProviderInfo[]> {
    const out: ProviderInfo[] = [];
    for await (const p of auth(this.client).listProviders()) {
      out.push({
        id: p.id,
        kind: p.kind,
        name: p.name,
        issuerUrl: p.issuerUrl,
        consoleClientId: p.consoleClientId,
        isDefault: p.isDefault,
      });
    }
    return out;
  }
}
