import { type Mock, vi } from "vitest";
import type {
  ApiKeyRecord,
  ApiKeysPort,
  MemberRecord,
  MembersPort,
} from "../../application/ports/members.js";
import {
  ApiKeysUseCases,
  MembersUseCases,
} from "../../application/usecases/members/MembersUseCases.js";

export const aMember = (over: Partial<MemberRecord> = {}): MemberRecord => ({
  id: "mem_1",
  role: "team_viewer",
  subjectType: "user",
  email: "ana@example.com",
  version: 2,
  createdAt: "2026-11-20T10:00:00Z",
  ...over,
});

export const aKey = (over: Partial<ApiKeyRecord> = {}): ApiKeyRecord => ({
  id: "key_1",
  name: "ci",
  role: "team_viewer",
  keyPrefix: "afs_ab12",
  expiresAt: "2026-12-22T00:00:00Z",
  createdAt: "2026-11-22T00:00:00Z",
  lastUsedAt: null,
  ...over,
});

export type FakeMembersPort = { [K in keyof MembersPort]: Mock<MembersPort[K]> };
export type FakeApiKeysPort = { [K in keyof ApiKeysPort]: Mock<ApiKeysPort[K]> };

export function fakeMembersPort(over: Partial<MembersPort> = {}): FakeMembersPort {
  return {
    list: vi.fn(async () => [
      aMember(),
      aMember({
        id: "mem_2",
        role: "team_admin",
        email: undefined,
        subjectType: "group",
        groupName: "payments-eng",
      }),
    ]),
    add: vi.fn(async () => aMember()),
    update: vi.fn(async () => aMember({ role: "team_admin", version: 3 })),
    remove: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeMembersPort;
}

export function fakeApiKeysPort(over: Partial<ApiKeysPort> = {}): FakeApiKeysPort {
  return {
    list: vi.fn(async () => [aKey()]),
    create: vi.fn(async () => ({
      key: aKey({ id: "key_2", name: "new" }),
      secretKey: "afs_SENTINEL",
      replayed: false,
    })),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeApiKeysPort;
}

export const membersServices = (m: MembersPort, k: ApiKeysPort) => ({
  members: new MembersUseCases(m),
  apiKeys: new ApiKeysUseCases(k, { now: () => Date.parse("2026-11-22T00:00:00Z") }),
});
