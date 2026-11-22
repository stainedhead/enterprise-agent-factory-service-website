import { type Mock, vi } from "vitest";
import type {
  AuditEventRecord,
  AuditPort,
  RevisionRecord,
  RevisionsPort,
} from "../../application/ports/history.js";
import { HistoryUseCases } from "../../application/usecases/history/HistoryUseCases.js";

export const anEvent = (over: Partial<AuditEventRecord> = {}): AuditEventRecord => ({
  id: 1,
  occurredAt: "2026-11-21T10:00:00Z",
  actorId: "usr_a",
  actorType: "user",
  action: "agents.create",
  outcome: "allowed",
  resourceKind: "agent",
  resourceId: "agt_1",
  requestId: "req_abc",
  ...over,
});

export const aRevision = (n: number, over: Partial<RevisionRecord> = {}): RevisionRecord => ({
  revision: n,
  resourceKind: "team",
  resourceId: "team_1",
  operation: "UPDATE",
  changedBy: "usr_a",
  changedAt: "2026-11-21T10:00:00Z",
  snapshot: { displayName: `Alpha ${n}`, kind: "persistent" },
  ...over,
});

export type FakeAuditPort = { [K in keyof AuditPort]: Mock<AuditPort[K]> };
export type FakeRevisionsPort = { [K in keyof RevisionsPort]: Mock<RevisionsPort[K]> };

export const fakeAuditPort = (over: Partial<AuditPort> = {}): FakeAuditPort =>
  ({
    list: vi.fn(async () => ({
      items: [
        anEvent(),
        anEvent({ id: 2, action: "teams.update", outcome: "denied", requestId: null }),
      ],
    })),
    csv: vi.fn(async () => "id,action\n1,agents.create\n"),
    ...over,
  }) as unknown as FakeAuditPort;

export const fakeRevisionsPort = (over: Partial<RevisionsPort> = {}): FakeRevisionsPort =>
  ({
    list: vi.fn(async () => ({
      items: [
        aRevision(3, { snapshot: undefined }),
        aRevision(2, { snapshot: undefined }),
        aRevision(1, { resourceId: "team_2", snapshot: undefined }),
      ],
    })),
    get: vi.fn(async (_t: string, n: number) => aRevision(n)),
    restore: vi.fn(async (_t: string, n: number, dryRun: boolean) => ({
      revision: n,
      dryRun,
      changes: [
        {
          action: "update",
          resourceKind: "team",
          resourceId: "team_1",
          reason: undefined,
          fields: [{ field: "displayName", from: "Alpha 3", to: "Alpha 1" }],
        },
      ],
      skipped: [
        {
          action: "skip",
          resourceKind: "secret-binding",
          resourceId: "sec_9",
          reason: "The secret no longer exists",
          fields: [],
        },
      ],
    })),
    ...over,
  }) as unknown as FakeRevisionsPort;

export const historyServices = (a: AuditPort, r: RevisionsPort) => ({
  history: new HistoryUseCases(a, r),
});
