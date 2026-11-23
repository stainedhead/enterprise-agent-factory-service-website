import { type Mock, vi } from "vitest";
import type { AgentsPort } from "../../application/ports/agents.js";
import type {
  PoolRecord,
  PoolRoleLinkRecord,
  PoolStatusRecord,
  PoolsPort,
  StageRecord,
} from "../../application/ports/pools.js";
import type { ReportsPort } from "../../application/ports/reports.js";
import { PoolsUseCases } from "../../application/usecases/pools/PoolsUseCases.js";
import { fakeAgentsPort } from "./agents.js";
import { status } from "./teams.js";

export const aStage = (over: Partial<StageRecord> = {}): StageRecord => ({
  id: "stg_1",
  name: "triage",
  position: 1,
  version: 2,
  ...over,
});

export const aPool = (over: Partial<PoolRecord> = {}): PoolRecord => ({
  id: "pool_1",
  name: "triage-workers",
  template: "hermes-dev",
  image: "ghcr.io/acme/hermes-dev@sha256:4b1e",
  models: {
    access: "selected",
    modelIds: ["claude-sonnet"],
    defaultModelId: "claude-sonnet",
    effectiveModelIds: ["claude-sonnet"],
  },
  workers: 4,
  stageId: "stg_1",
  state: "enabled",
  handoffs: ["pool_2"],
  scratchSizeGiB: 20,
  sharedVolume: "none",
  generation: 1,
  version: 3,
  status: status(),
  ...over,
});

export const aPoolStatus = (over: Partial<PoolStatusRecord> = {}): PoolStatusRecord => ({
  status: status(),
  workers: { desired: 4, reporting: 4, working: 2, idle: 1, impaired: 1 },
  ...over,
});

export const aRoleLink = (over: Partial<PoolRoleLinkRecord> = {}): PoolRoleLinkRecord => ({
  id: "prl_1",
  accountId: "111122223333",
  roleName: "swarm-reader",
  profileName: "swarm-reader",
  status: "verified",
  lastVerifiedAt: "2026-11-21T10:00:00Z",
  lastError: undefined,
  version: 1,
  ...over,
});

export type FakePoolsPort = { [K in keyof PoolsPort]: Mock<PoolsPort[K]> };

export function fakePoolsPort(over: Partial<PoolsPort> = {}): FakePoolsPort {
  const pools = [
    aPool(),
    aPool({ id: "pool_2", name: "fixers", workers: 2, stageId: "stg_2", handoffs: [], version: 1 }),
  ];
  return {
    listStages: vi.fn(async () => [aStage(), aStage({ id: "stg_2", name: "fix", position: 2 })]),
    createStage: vi.fn(async (_t, i) => aStage({ id: "stg_9", ...i })),
    updateStage: vi.fn(async () => aStage()),
    deleteStage: vi.fn(async () => undefined),
    list: vi.fn(async () => pools),
    get: vi.fn(async () => aPool()),
    create: vi.fn(async (_t, i) => aPool({ id: "pool_9", name: i.name, version: 1 })),
    update: vi.fn(async () => aPool()),
    delete: vi.fn(async () => aPool({ state: "deleting" })),
    scale: vi.fn(async (_t, _p, w) => aPool({ workers: w })),
    pause: vi.fn(async () => aPool({ state: "paused" })),
    resume: vi.fn(async () => aPool()),
    status: vi.fn(async () => aPoolStatus()),
    handoffs: vi.fn(async () => ({ toPoolIds: ["pool_2"], version: 1 })),
    putHandoffs: vi.fn(async (_t, _r, ids) => ({ toPoolIds: ids, version: 2 })),
    secretBindings: vi.fn(async () => ({ items: [], version: 1 })),
    putSecretBindings: vi.fn(async (_t, _r, items) => ({ items, version: 2 })),
    configValues: vi.fn(async () => []),
    putConfigValue: vi.fn(async (_t, _p, v) => ({
      name: v.name,
      source: v.source,
      value: v.value,
    })),
    deleteConfigValue: vi.fn(async () => undefined),
    externalSystems: vi.fn(async () => []),
    putExternalSystem: vi.fn(async () => undefined),
    roleLinks: vi.fn(async () => [aRoleLink()]),
    createRoleLink: vi.fn(async (_t, _p, i) =>
      aRoleLink({ id: `prl_${i.accountId}`, accountId: i.accountId, roleName: i.roleName }),
    ),
    deleteRoleLink: vi.fn(async () => undefined),
    verifyRoleLink: vi.fn(async () => aRoleLink()),
    ...over,
  } as unknown as FakePoolsPort;
}

export function poolsServices(
  p: PoolsPort,
  agents: Pick<AgentsPort, "list" | "templates"> = fakeAgentsPort(),
  reports?: Pick<ReportsPort, "run">,
) {
  return { pools: new PoolsUseCases(p, agents, reports) };
}
