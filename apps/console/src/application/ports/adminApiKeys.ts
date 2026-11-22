// Service API keys (S10): keys with the `security_operator` role only (WEB-US-20.5).
import type { ApiKeyRecord, CreateApiKeyInput, CreatedApiKey } from "./members.js";

export type { ApiKeyRecord, CreateApiKeyInput, CreatedApiKey };

export interface AdminApiKeysPort {
  list(signal?: AbortSignal): Promise<readonly ApiKeyRecord[]>;
  create(input: CreateApiKeyInput): Promise<CreatedApiKey>;
  delete(keyId: string): Promise<void>;
}
