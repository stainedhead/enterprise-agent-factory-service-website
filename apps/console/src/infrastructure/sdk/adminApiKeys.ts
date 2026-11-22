import { type AfsClient, adminApiKeys, metaOf } from "@afs/sdk";
import type {
  AdminApiKeysPort,
  ApiKeyRecord,
  CreateApiKeyInput,
  CreatedApiKey,
} from "../../application/ports/adminApiKeys.js";
import { toAppError } from "./errors.js";

/** `admin.apiKeys.*` mapped to {@link AdminApiKeysPort}; the one-time secret is handed back, never kept. */
export class SdkAdminApiKeys implements AdminApiKeysPort {
  constructor(private readonly client: AfsClient) {}

  async list(signal?: AbortSignal): Promise<readonly ApiKeyRecord[]> {
    try {
      const out: ApiKeyRecord[] = [];
      for await (const k of adminApiKeys(this.client).list({
        maxResults: 100,
        ...(signal ? { signal } : {}),
      }))
        out.push(k);
      return out;
    } catch (e) {
      throw toAppError(e);
    }
  }
  async create(input: CreateApiKeyInput): Promise<CreatedApiKey> {
    try {
      const k = await adminApiKeys(this.client).create({
        name: input.name,
        role: "security_operator",
        expiresAt: input.expiresAt,
      });
      const { secretKey, ...key } = k;
      return { key, secretKey, replayed: metaOf(k)?.idempotentReplayed === true };
    } catch (e) {
      throw toAppError(e);
    }
  }
  async delete(keyId: string): Promise<void> {
    try {
      await adminApiKeys(this.client).delete(keyId);
    } catch (e) {
      throw toAppError(e);
    }
  }
}
