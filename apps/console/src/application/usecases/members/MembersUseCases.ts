import { AppError } from "../../errors.js";
import type { ClockPort } from "../../ports/auth.js";
import type {
  AddMemberInput,
  ApiKeyRecord,
  ApiKeysPort,
  CreatedApiKey,
  MemberRecord,
  MemberRef,
  MembersPort,
} from "../../ports/members.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

const DAY_MS = 86_400_000;
/** D50 / WEB-US-29.2: keys last at most 90 days; 30 by default. */
export const API_KEY_MAX_DAYS = 90;
export const API_KEY_DEFAULT_DAYS = 30;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Team membership (M1-M1): add people or IdP groups, change a role, remove. The API decides the roles. */
export class MembersUseCases {
  constructor(private readonly port: MembersPort) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly MemberRecord[]> {
    return this.port.list(teamId, signal);
  }

  add(teamId: string, input: AddMemberInput): Promise<MemberRecord> {
    const email = input.email?.trim();
    const groupName = input.groupName?.trim();
    if (input.subjectType === "user") {
      if (!email) return Promise.reject(invalid("email", "Enter an email address"));
      if (!EMAIL.test(email))
        return Promise.reject(invalid("email", "Enter an email such as ana@example.com"));
    } else if (!groupName) {
      return Promise.reject(invalid("groupName", "Enter the IdP group name"));
    }
    return this.port.add(teamId, {
      subjectType: input.subjectType,
      role: input.role,
      ...(input.subjectType === "user" ? { email } : { groupName }),
      ...(input.identityProviderId && { identityProviderId: input.identityProviderId }),
    });
  }

  updateRole(teamId: string, ref: MemberRef, role: string): Promise<MemberRecord> {
    return this.port.update(teamId, { id: ref.id, version: ref.version }, role);
  }

  remove(teamId: string, ref: MemberRef): Promise<void> {
    return this.port.remove(teamId, { id: ref.id, version: ref.version });
  }
}

export interface ApiKeyDraft {
  readonly name: string;
  readonly role: string;
  /** Days until expiry; blank means the default. */
  readonly days: string;
}

/** Team API keys (M1-M2). The secret of a new key passes through and is never kept here. */
export class ApiKeysUseCases {
  constructor(
    private readonly port: ApiKeysPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly ApiKeyRecord[]> {
    return this.port.list(teamId, signal);
  }

  /** The expiry for `days`: the API refuses more than 90 days ahead, so the last day keeps a minute of margin. */
  expiryFor(days: number): string {
    const margin = days === API_KEY_MAX_DAYS ? 60_000 : 0;
    return new Date(this.clock.now() + days * DAY_MS - margin).toISOString();
  }

  create(teamId: string, draft: ApiKeyDraft): Promise<CreatedApiKey> {
    const name = draft.name.trim();
    if (!name) return Promise.reject(invalid("name", "Enter a name"));
    const days = draft.days.trim() === "" ? API_KEY_DEFAULT_DAYS : Number(draft.days);
    if (!Number.isInteger(days) || days < 1 || days > API_KEY_MAX_DAYS)
      return Promise.reject(
        invalid("expiresAt", `Enter a whole number of days from 1 to ${API_KEY_MAX_DAYS}`),
      );
    return this.port.create(teamId, { name, role: draft.role, expiresAt: this.expiryFor(days) });
  }

  delete(teamId: string, keyId: string): Promise<void> {
    return this.port.delete(teamId, keyId);
  }
}
