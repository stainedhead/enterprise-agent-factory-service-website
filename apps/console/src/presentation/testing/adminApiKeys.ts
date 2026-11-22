import { type Mock, vi } from "vitest";
import type { AdminApiKeysPort } from "../../application/ports/adminApiKeys.js";
import type {
  AdminSecurityOperatorsPort,
  SecurityOperatorRecord,
} from "../../application/ports/adminSecurityOperators.js";
import { AdminApiKeysUseCases } from "../../application/usecases/adminApiKeys/AdminApiKeysUseCases.js";
import { AdminSecurityOperatorsUseCases } from "../../application/usecases/adminSecurityOperators/AdminSecurityOperatorsUseCases.js";
import { aKey } from "./members.js";

export const NOW = Date.parse("2026-11-22T00:00:00Z");

export const anOperator = (over: Partial<SecurityOperatorRecord> = {}): SecurityOperatorRecord => ({
  id: "rb_1",
  subjectType: "user",
  email: "sam@example.com",
  createdAt: "2026-11-20T10:00:00Z",
  ...over,
});

export type FakeAdminApiKeysPort = { [K in keyof AdminApiKeysPort]: Mock<AdminApiKeysPort[K]> };
export type FakeOperatorsPort = {
  [K in keyof AdminSecurityOperatorsPort]: Mock<AdminSecurityOperatorsPort[K]>;
};

export function fakeAdminApiKeysPort(over: Partial<AdminApiKeysPort> = {}): FakeAdminApiKeysPort {
  return {
    list: vi.fn(async () => [aKey({ id: "key_9", name: "pipeline", role: "security_operator" })]),
    create: vi.fn(async () => ({
      key: aKey({ id: "key_10", name: "new", role: "security_operator" }),
      secretKey: "afsk_SENTINEL",
      replayed: false,
    })),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeAdminApiKeysPort;
}

export function fakeOperatorsPort(
  over: Partial<AdminSecurityOperatorsPort> = {},
): FakeOperatorsPort {
  return {
    list: vi.fn(async () => [
      anOperator(),
      anOperator({ id: "rb_2", subjectType: "group", email: undefined, groupName: "secops" }),
    ]),
    add: vi.fn(async () => anOperator({ id: "rb_3" })),
    remove: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeOperatorsPort;
}

export const adminApiKeysServices = (k: AdminApiKeysPort, o: AdminSecurityOperatorsPort) => ({
  adminApiKeys: new AdminApiKeysUseCases(k, { now: () => NOW }),
  adminSecurityOperators: new AdminSecurityOperatorsUseCases(o),
});
