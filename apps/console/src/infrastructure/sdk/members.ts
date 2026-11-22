import { type AfsClient, apiKeys, members, metaOf } from "@afs/sdk";
import type {
  AddMemberInput,
  ApiKeyRecord,
  ApiKeysPort,
  CreateApiKeyInput,
  CreatedApiKey,
  MemberRecord,
  MemberRef,
  MembersPort,
} from "../../application/ports/members.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

/** `members.*` calls mapped to {@link MembersPort}. */
export class SdkMembers implements MembersPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly MemberRecord[]> {
    return wrap(() => all(members(this.client).list(teamId, { maxResults: 100, ...sig(signal) })));
  }
  add(teamId: string, input: AddMemberInput): Promise<MemberRecord> {
    return wrap(() =>
      members(this.client).add(teamId, {
        subjectType: input.subjectType,
        role: input.role as "team_admin",
        ...(input.email !== undefined && { email: input.email }),
        ...(input.groupName !== undefined && { groupName: input.groupName }),
        ...(input.identityProviderId !== undefined && {
          identityProviderId: input.identityProviderId,
        }),
      }),
    );
  }
  update(teamId: string, ref: MemberRef, role: string): Promise<MemberRecord> {
    return wrap(() =>
      members(this.client).update(
        teamId,
        { id: ref.id, version: ref.version },
        {
          role: role as "team_admin",
        },
      ),
    );
  }
  remove(teamId: string, ref: MemberRef): Promise<void> {
    return wrap(() => members(this.client).remove(teamId, { id: ref.id, version: ref.version }));
  }
}

/** `apiKeys.*` calls mapped to {@link ApiKeysPort}; the replay marker comes from the response metadata (D52). */
export class SdkApiKeys implements ApiKeysPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly ApiKeyRecord[]> {
    return wrap(() => all(apiKeys(this.client).list(teamId, { maxResults: 100, ...sig(signal) })));
  }
  create(teamId: string, input: CreateApiKeyInput): Promise<CreatedApiKey> {
    return wrap(async () => {
      const k = await apiKeys(this.client).create(teamId, {
        name: input.name,
        role: input.role as "team_admin",
        expiresAt: input.expiresAt,
      });
      const { secretKey, ...key } = k;
      return { key, secretKey, replayed: metaOf(k)?.idempotentReplayed === true };
    });
  }
  delete(teamId: string, keyId: string): Promise<void> {
    return wrap(() => apiKeys(this.client).delete(teamId, keyId));
  }
}
