import { type AfsClient, agents } from "@afs/sdk";
import type {
  AgentIdentityInput,
  AgentIdentityRecord,
  IdentityPort,
  RoleLinkInput,
  RoleLinkRecord,
} from "../../application/ports/identity.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type WireLink = Awaited<ReturnType<ReturnType<typeof agents>["roleLinks"]["get"]>>;
type WireIdentity = Awaited<ReturnType<ReturnType<typeof agents>["identities"]["create"]>>;

const link = (l: WireLink): RoleLinkRecord => ({
  id: l.id,
  accountId: l.accountId,
  roleArn: l.roleArn,
  profileName: l.profileName,
  maxSessionSeconds: l.maxSessionSeconds,
  externalId: l.externalId,
  status: l.status,
  lastVerifiedAt: l.lastVerifiedAt ?? undefined,
  lastError: l.lastError ?? undefined,
  trustPolicy: l.trustPolicy,
  version: l.version,
});
const identity = (i: WireIdentity): AgentIdentityRecord => ({
  id: i.id,
  kind: i.kind,
  externalRef: i.externalRef,
  secretId: i.secretId ?? undefined,
  status: i.status,
  version: i.version,
});

/** `agents.roleLinks.*` and `agents.identities.*` mapped to {@link IdentityPort}. */
export class SdkIdentity implements IdentityPort {
  constructor(private readonly client: AfsClient) {}

  roleLinks(teamId: string, agentId: string, signal?: AbortSignal) {
    return wrap(async () => {
      const out: RoleLinkRecord[] = [];
      for await (const l of agents(this.client).roleLinks.list(teamId, agentId, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(link(l));
      return out;
    });
  }
  linksForAgents(teamId: string, agentIds: readonly string[], signal?: AbortSignal) {
    return wrap(async () => {
      const out: Record<string, readonly RoleLinkRecord[]> = {};
      await Promise.all(
        agentIds.map(async (id) => {
          out[id] = await this.roleLinks(teamId, id, signal);
        }),
      );
      return out;
    });
  }
  roleLink(teamId: string, agentId: string, linkId: string, signal?: AbortSignal) {
    return wrap(async () =>
      link(await agents(this.client).roleLinks.get(teamId, agentId, linkId, sig(signal))),
    );
  }
  createRoleLink(teamId: string, agentId: string, input: RoleLinkInput) {
    return wrap(async () =>
      link(
        await agents(this.client).roleLinks.create(teamId, agentId, {
          roleArn: input.roleArn,
          profileName: input.profileName,
          ...(input.maxSessionSeconds !== undefined && {
            maxSessionSeconds: input.maxSessionSeconds,
          }),
        }),
      ),
    );
  }
  deleteRoleLink(teamId: string, agentId: string, ref: { id: string; version: number }) {
    return wrap(() => agents(this.client).roleLinks.delete(teamId, agentId, ref));
  }
  verifyRoleLink(teamId: string, agentId: string, linkId: string) {
    return wrap(async () =>
      link(await agents(this.client).roleLinks.verify(teamId, agentId, linkId)),
    );
  }
  identities(teamId: string, agentId: string, signal?: AbortSignal) {
    return wrap(async () => {
      const out: AgentIdentityRecord[] = [];
      for await (const i of agents(this.client).identities.list(teamId, agentId, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(identity(i));
      return out;
    });
  }
  createIdentity(teamId: string, agentId: string, input: AgentIdentityInput) {
    return wrap(async () =>
      identity(
        await agents(this.client).identities.create(teamId, agentId, {
          kind: input.kind,
          externalRef: input.externalRef,
          ...(input.secretId && { secretId: input.secretId }),
        }),
      ),
    );
  }
  deleteIdentity(teamId: string, agentId: string, ref: { id: string; version: number }) {
    return wrap(() => agents(this.client).identities.delete(teamId, agentId, ref));
  }
}
