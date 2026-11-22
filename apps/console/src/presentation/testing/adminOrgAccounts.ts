import { type Mock, vi } from "vitest";
import type {
  AdminOrgAccountsPort,
  OrgAccountRecord,
} from "../../application/ports/adminOrgAccounts.js";
import { AdminOrgAccountsUseCases } from "../../application/usecases/adminOrgAccounts/AdminOrgAccountsUseCases.js";

export const anAccount = (over: Partial<OrgAccountRecord> = {}): OrgAccountRecord => ({
  accountId: "111122223333",
  name: "prod-payments",
  status: "active",
  ...over,
});

export type FakeOrgAccountsPort = {
  [K in keyof AdminOrgAccountsPort]: Mock<AdminOrgAccountsPort[K]>;
};

export function fakeOrgAccountsPort(over: Partial<AdminOrgAccountsPort> = {}): FakeOrgAccountsPort {
  const accounts = [
    anAccount(),
    anAccount({ accountId: "222233334444", name: "prod-platform" }),
    anAccount({ accountId: "444455556666", name: "staging-payments" }),
  ];
  return {
    listOrgAccounts: vi.fn(async () => accounts),
    listAllowed: vi.fn(async () => accounts.filter((a) => a.name?.endsWith("payments"))),
    linkCounts: vi.fn(async () => ({ "111122223333": 2, "444455556666": 1 })),
    ...over,
  } as unknown as FakeOrgAccountsPort;
}

export const orgAccountsServices = (p: AdminOrgAccountsPort) => ({
  adminOrgAccounts: new AdminOrgAccountsUseCases(p),
});
