import { type Mock, vi } from "vitest";
import type {
  AgentRecord,
  AgentsPort,
  AgentTemplateRecord,
  SnapshotRecord,
  StorageClassRecord,
} from "../../application/ports/agents.js";
import { AgentsUseCases } from "../../application/usecases/agents/AgentsUseCases.js";
import { status } from "./teams.js";

export const anAgent = (over: Partial<AgentRecord> = {}): AgentRecord => ({
  id: "agt_1",
  name: "reviewer-bot",
  template: "hermes-dev",
  image: "ghcr.io/acme/omp-review@sha256:9f2c",
  modelId: "claude-sonnet",
  paused: false,
  generation: 1,
  version: 4,
  iamIdentity: "team_shared",
  secretBindings: [{ secretId: "sec_1", delivery: "env", target: "GITHUB_APP_KEY" }],
  resources: { cpu: "2", memory: "8Gi" },
  volume: {
    sizeGiB: 50,
    storageClass: "gp3",
    onDelete: "snapshot_then_delete",
    snapshotSchedule: "daily",
    snapshotRetain: 7,
  },
  status: status(),
  ...over,
});

export const aTemplate = (over: Partial<AgentTemplateRecord> = {}): AgentTemplateRecord => ({
  name: "hermes-dev",
  harness: "hermes",
  enabled: true,
  currentDigest: "ghcr.io/acme/hermes-dev@sha256:4b1e",
  allowedDigests: ["ghcr.io/acme/hermes-dev@sha256:4b1e", "ghcr.io/acme/hermes-dev@sha256:3a0d"],
  defaultResources: { cpu: "2", memory: "8Gi" },
  version: 1,
  ...over,
});

export const aStorageClass = (over: Partial<StorageClassRecord> = {}): StorageClassRecord => ({
  name: "gp3",
  enabled: true,
  volumeType: "gp3",
  description: "general purpose SSD, encrypted",
  version: 1,
  ...over,
});

export const aSnapshot = (over: Partial<SnapshotRecord> = {}): SnapshotRecord => ({
  id: "snap_1",
  agentId: "agt_1",
  reason: "scheduled",
  state: "completed",
  requestedAt: "2026-11-22T03:00:00Z",
  completedAt: "2026-11-22T03:05:00Z",
  ...over,
});

export type FakeAgentsPort = { [K in keyof AgentsPort]: Mock<AgentsPort[K]> };

export function fakeAgentsPort(over: Partial<AgentsPort> = {}): FakeAgentsPort {
  const agents = [
    anAgent(),
    anAgent({
      id: "agt_2",
      name: "incident-scribe",
      paused: true,
      template: "hermes-ops",
      version: 2,
    }),
  ];
  return {
    list: vi.fn(async () => agents),
    get: vi.fn(async () => anAgent()),
    create: vi.fn(async () => anAgent({ id: "agt_9", name: "new-agent" })),
    update: vi.fn(async () => anAgent({ version: 5 })),
    delete: vi.fn(async () => anAgent({ status: status("Deleting") })),
    pause: vi.fn(async () => anAgent({ paused: true })),
    resume: vi.fn(async () => anAgent()),
    restart: vi.fn(async () => anAgent({ status: status("Reconciling") })),
    status: vi.fn(async () => status()),
    snapshots: vi.fn(async () => [aSnapshot()]),
    createSnapshot: vi.fn(async () => aSnapshot({ id: "snap_2", state: "requested" })),
    templates: vi.fn(async () => [
      aTemplate(),
      aTemplate({
        name: "hermes-ops",
        currentDigest: "x@sha256:1",
        allowedDigests: ["x@sha256:1"],
      }),
      aTemplate({ name: "old", enabled: false }),
    ]),
    storageClasses: vi.fn(async () => [
      aStorageClass(),
      aStorageClass({ name: "io2", volumeType: "io2", enabled: false }),
    ]),
    logDestinations: vi.fn(async () => [
      { id: "log_1", name: "central-cloudwatch", kind: "cloudwatch", enabled: true },
    ]),
    monthCosts: vi.fn(async () => ({ agt_1: "12980.00" })),
    ...over,
  } as unknown as FakeAgentsPort;
}

export const agentsServices = (p: AgentsPort) => ({ agents: new AgentsUseCases(p) });
