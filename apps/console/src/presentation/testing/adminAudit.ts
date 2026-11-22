import { type Mock, vi } from "vitest";
import type { AdminAuditEventRecord, AdminAuditPort } from "../../application/ports/adminAudit.js";
import { AdminAuditUseCases } from "../../application/usecases/adminAudit/AdminAuditUseCases.js";

export const anAdminEvent = (over: Partial<AdminAuditEventRecord> = {}): AdminAuditEventRecord => ({
  id: 1,
  occurredAt: "2026-11-21T10:00:00Z",
  actorId: "usr_1",
  actorType: "user",
  action: "teams.suspend",
  outcome: "allowed",
  resourceKind: "team",
  resourceId: "team_1",
  requestId: "req_1",
  teamId: "team_1",
  ...over,
});

export type FakeAdminAuditPort = { [K in keyof AdminAuditPort]: Mock<AdminAuditPort[K]> };

export function fakeAdminAuditPort(over: Partial<AdminAuditPort> = {}): FakeAdminAuditPort {
  return {
    list: vi.fn(async () => ({ items: [anAdminEvent()] })),
    csv: vi.fn(async () => "id,action\n1,teams.suspend\n"),
    ...over,
  } as unknown as FakeAdminAuditPort;
}

export const adminAuditServices = (p: AdminAuditPort) => ({
  adminAudit: new AdminAuditUseCases(p),
});
