import { type Mock, vi } from "vitest";
import type {
  SwarmTemplateRecord,
  SwarmTemplatesPort,
} from "../../application/ports/swarmTemplates.js";
import type {
  TeamDirectoryEntry,
  TeamDirectoryPort,
} from "../../application/ports/teamDirectory.js";
import type {
  WorkOrderDetail,
  WorkOrderRecord,
  WorkOrderRepoRecord,
  WorkOrdersPort,
} from "../../application/ports/workOrders.js";
import { SwarmTemplatesUseCases } from "../../application/usecases/swarmTemplates/SwarmTemplatesUseCases.js";
import { TeamDirectoryUseCases } from "../../application/usecases/teamDirectory/TeamDirectoryUseCases.js";
import { WorkOrdersUseCases } from "../../application/usecases/workOrders/WorkOrdersUseCases.js";

export const aWorkOrder = (over: Partial<WorkOrderRecord> = {}): WorkOrderRecord => ({
  id: "wo_1",
  title: "OpenSSL remote code execution",
  kind: "cve_remediation",
  cveId: "CVE-2026-1234",
  severity: "critical",
  status: "in_progress",
  slaState: "due_soon",
  slaDueAt: "2026-11-28T18:00:00Z",
  templateId: "swt_1",
  budgetUsd: "500.00",
  teamId: "team_9",
  progress: {
    repos: 2,
    prsOpen: 1,
    prsMerged: 0,
    notAffected: 0,
    failedOrSkipped: 0,
    remaining: 1,
  },
  version: 3,
  ...over,
});

export const aRepo = (over: Partial<WorkOrderRepoRecord> = {}): WorkOrderRepoRecord => ({
  host: "github.com",
  repo: "acme/payments-api",
  status: "pr_opened",
  owningTeamId: "team_1",
  prUrl: "https://github.com/acme/payments-api/pull/7",
  prNumber: 7,
  notifications: [
    { kind: "assigned", recipient: "ops@example.com", sentAt: "2026-11-21T18:00:00Z" },
  ],
  version: 2,
  ...over,
});

export const aWorkOrderDetail = (over: Partial<WorkOrderDetail> = {}): WorkOrderDetail => ({
  ...aWorkOrder(),
  repos: [
    aRepo(),
    aRepo({
      repo: "acme/ledger",
      status: "pending",
      owningTeamId: "team_2",
      prUrl: null,
      prNumber: null,
      notifications: [],
    }),
  ],
  ...over,
});

export const aTeamEntry = (over: Partial<TeamDirectoryEntry> = {}): TeamDirectoryEntry => ({
  id: "team_1",
  slug: "payments",
  displayName: "Payments",
  ...over,
});

export const aSwarmTemplate = (over: Partial<SwarmTemplateRecord> = {}): SwarmTemplateRecord => ({
  id: "swt_1",
  name: "cve-remediation",
  kind: "cve_remediation",
  description: "Patch a CVE across repositories",
  budgetUsd: "500.00",
  ttlHours: 72,
  teardownRule: "at_work_complete",
  enabled: true,
  spec: { stages: [{ name: "scan" }], pools: [{ name: "workers" }] },
  version: 1,
  ...over,
});

export type FakeWorkOrdersPort = { [K in keyof WorkOrdersPort]: Mock<WorkOrdersPort[K]> };
export function fakeWorkOrdersPort(over: Partial<WorkOrdersPort> = {}): FakeWorkOrdersPort {
  return {
    listForTeam: vi.fn(async () => ({ items: [aWorkOrder()] })),
    list: vi.fn(async () => [aWorkOrder()]),
    create: vi.fn(async () => aWorkOrderDetail()),
    get: vi.fn(async () => aWorkOrderDetail()),
    cancel: vi.fn(async () => aWorkOrder({ status: "cancelled" })),
    update: vi.fn(async () => aWorkOrder()),
    repos: vi.fn(async () => aWorkOrderDetail().repos),
    updateRepo: vi.fn(async () => aRepo()),
    ...over,
  } as unknown as FakeWorkOrdersPort;
}

export type FakeTeamDirectoryPort = { [K in keyof TeamDirectoryPort]: Mock<TeamDirectoryPort[K]> };
export function fakeTeamDirectoryPort(
  over: Partial<TeamDirectoryPort> = {},
): FakeTeamDirectoryPort {
  return {
    list: vi.fn(async () => [
      aTeamEntry(),
      aTeamEntry({ id: "team_2", slug: "ledger", displayName: "Ledger" }),
    ]),
    ...over,
  } as unknown as FakeTeamDirectoryPort;
}

export type FakeSwarmTemplatesPort = {
  [K in keyof SwarmTemplatesPort]: Mock<SwarmTemplatesPort[K]>;
};
export function fakeSwarmTemplatesPort(
  over: Partial<SwarmTemplatesPort> = {},
): FakeSwarmTemplatesPort {
  return {
    list: vi.fn(async () => [
      aSwarmTemplate(),
      aSwarmTemplate({ id: "swt_2", name: "retired", enabled: false }),
    ]),
    ...over,
  } as unknown as FakeSwarmTemplatesPort;
}

export const workOrdersServices = (
  w: WorkOrdersPort,
  d: TeamDirectoryPort,
  t: SwarmTemplatesPort,
) => ({
  workOrders: new WorkOrdersUseCases(w),
  teamDirectory: new TeamDirectoryUseCases(d),
  swarmTemplates: new SwarmTemplatesUseCases(t),
});
