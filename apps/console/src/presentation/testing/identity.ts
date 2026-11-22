import { type Mock, vi } from "vitest";
import type {
  AgentIdentityRecord,
  IdentityPort,
  RoleLinkRecord,
} from "../../application/ports/identity.js";
import { IdentityUseCases } from "../../application/usecases/identity/IdentityUseCases.js";

export const aLink = (over: Partial<RoleLinkRecord> = {}): RoleLinkRecord => ({
  id: "lnk_1",
  accountId: "111122223333",
  roleArn: "arn:aws:iam::111122223333:role/afs/reader",
  profileName: "prod-reader",
  maxSessionSeconds: 3600,
  externalId: "afs-ext-1",
  status: "verified",
  lastVerifiedAt: "2026-11-22T06:00:00Z",
  lastError: undefined,
  trustPolicy: { Effect: "Allow", Condition: { StringEquals: { "sts:ExternalId": "afs-ext-1" } } },
  version: 2,
  ...over,
});

export const anIdentity = (over: Partial<AgentIdentityRecord> = {}): AgentIdentityRecord => ({
  id: "aid_1",
  kind: "github_app",
  externalRef: "app-123",
  secretId: "sec_1",
  status: "active",
  version: 1,
  ...over,
});

export type FakeIdentityPort = { [K in keyof IdentityPort]: Mock<IdentityPort[K]> };

export function fakeIdentityPort(over: Partial<IdentityPort> = {}): FakeIdentityPort {
  return {
    roleLinks: vi.fn(async () => [aLink()]),
    linksForAgents: vi.fn(async (_t: string, ids: readonly string[]) =>
      Object.fromEntries(ids.map((id) => [id, [aLink()]])),
    ),
    roleLink: vi.fn(async () => aLink()),
    createRoleLink: vi.fn(async () =>
      aLink({ id: "lnk_2", status: "pending_trust", lastVerifiedAt: undefined }),
    ),
    deleteRoleLink: vi.fn(async () => undefined),
    verifyRoleLink: vi.fn(async () => aLink()),
    identities: vi.fn(async () => [anIdentity()]),
    createIdentity: vi.fn(async () => anIdentity()),
    deleteIdentity: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeIdentityPort;
}

const clock = { setTimeout: (fn: () => void) => (fn(), 0) };
export const identityServices = (p: IdentityPort) => ({ identity: new IdentityUseCases(p, clock) });
