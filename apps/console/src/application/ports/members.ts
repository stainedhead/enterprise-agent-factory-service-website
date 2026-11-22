// The members and API keys ports (M1-M1, M1-M2): `ListMembers`, `AddMember`, `UpdateMember`,
// `RemoveMember`, `ListApiKeys`, `CreateApiKey`, `DeleteApiKey`.

export interface MemberRecord {
  readonly id: string;
  readonly role: string;
  readonly subjectType: string;
  readonly version: number;
  readonly email?: string | undefined;
  readonly groupName?: string | undefined;
  readonly userId?: string | undefined;
  readonly identityProviderId?: string | undefined;
  readonly createdAt?: string | undefined;
}

export interface AddMemberInput {
  readonly subjectType: "user" | "group";
  /** Passed through: the API refuses a role the console never offers (`service_admin`). */
  readonly role: string;
  readonly email?: string | undefined;
  readonly groupName?: string | undefined;
  readonly identityProviderId?: string | undefined;
}

export interface MemberRef {
  readonly id: string;
  readonly version: number;
}

export interface MembersPort {
  list(teamId: string, signal?: AbortSignal): Promise<readonly MemberRecord[]>;
  add(teamId: string, input: AddMemberInput): Promise<MemberRecord>;
  update(teamId: string, ref: MemberRef, role: string): Promise<MemberRecord>;
  remove(teamId: string, ref: MemberRef): Promise<void>;
}

/** An API key as listed: the prefix identifies it, the secret is never part of it. */
export interface ApiKeyRecord {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly keyPrefix: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly lastUsedAt?: string | null | undefined;
}

export interface CreateApiKeyInput {
  readonly name: string;
  readonly role: string;
  /** ISO timestamp, at most 90 days ahead. */
  readonly expiresAt: string;
}

/** The answer to `CreateApiKey`. `secretKey` is present once; a replayed create has none (D52). */
export interface CreatedApiKey {
  readonly key: ApiKeyRecord;
  readonly secretKey: string | undefined;
  readonly replayed: boolean;
}

export interface ApiKeysPort {
  list(teamId: string, signal?: AbortSignal): Promise<readonly ApiKeyRecord[]>;
  create(teamId: string, input: CreateApiKeyInput): Promise<CreatedApiKey>;
  delete(teamId: string, keyId: string): Promise<void>;
}
