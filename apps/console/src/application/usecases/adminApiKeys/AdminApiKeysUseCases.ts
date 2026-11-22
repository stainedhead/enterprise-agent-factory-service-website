import { AppError } from "../../errors.js";
import type { AdminApiKeysPort, ApiKeyRecord, CreatedApiKey } from "../../ports/adminApiKeys.js";
import type { ClockPort } from "../../ports/auth.js";

/** D50 / WEB-US-20.5: service keys last at most 90 days; 30 by default. */
export const SERVICE_KEY_MAX_DAYS = 90;
export const SERVICE_KEY_DEFAULT_DAYS = 30;
const DAY_MS = 86_400_000;

export interface ServiceKeyDraft {
  readonly name: string;
  readonly days: string;
}

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** Service API keys: the role is always `security_operator`. The secret of a new key passes through, never kept. */
export class AdminApiKeysUseCases {
  constructor(
    private readonly port: AdminApiKeysPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  list(signal?: AbortSignal): Promise<readonly ApiKeyRecord[]> {
    return this.port.list(signal);
  }

  /** The expiry for `days`; the last allowed day keeps a minute of margin under the API's limit. */
  expiryFor(days: number): string {
    const margin = days === SERVICE_KEY_MAX_DAYS ? 60_000 : 0;
    return new Date(this.clock.now() + days * DAY_MS - margin).toISOString();
  }

  create(d: ServiceKeyDraft): Promise<CreatedApiKey> {
    const name = d.name.trim();
    if (!name) return Promise.reject(invalid("name", "Enter a name"));
    if (name.length > 100) return Promise.reject(invalid("name", "Use at most 100 characters"));
    const days = d.days.trim() === "" ? SERVICE_KEY_DEFAULT_DAYS : Number(d.days);
    if (!Number.isInteger(days) || days < 1 || days > SERVICE_KEY_MAX_DAYS)
      return Promise.reject(
        invalid("expiresAt", `Enter a whole number of days from 1 to ${SERVICE_KEY_MAX_DAYS}`),
      );
    return this.port.create({
      name,
      role: "security_operator",
      expiresAt: this.expiryFor(days),
    });
  }

  delete(keyId: string): Promise<void> {
    return this.port.delete(keyId);
  }
}
