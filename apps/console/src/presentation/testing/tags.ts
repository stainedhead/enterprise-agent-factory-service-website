import { type Mock, vi } from "vitest";
import type {
  AdminCostTagStatusPort,
  CostTagStatusItem,
} from "../../application/ports/adminCostTagStatus.js";
import type {
  AdminServiceTagsPort,
  ServiceTagItem,
} from "../../application/ports/adminServiceTags.js";
import type { TagsPort, TeamTagsView } from "../../application/ports/tags.js";
import { AdminCostTagStatusUseCases } from "../../application/usecases/adminCostTagStatus/AdminCostTagStatusUseCases.js";
import { AdminServiceTagsUseCases } from "../../application/usecases/adminServiceTags/AdminServiceTagsUseCases.js";
import { TagsUseCases } from "../../application/usecases/tags/TagsUseCases.js";

export const aServiceTag = (over: Partial<ServiceTagItem> = {}): ServiceTagItem => ({
  key: "environment",
  mode: "required",
  allowedValues: ["prod", "dev"],
  defaultValue: "dev",
  description: "Deployment environment",
  version: 2,
  ...over,
});

export type FakeServiceTagsPort = {
  [K in keyof AdminServiceTagsPort]: Mock<AdminServiceTagsPort[K]>;
};
export function fakeServiceTagsPort(over: Partial<AdminServiceTagsPort> = {}): FakeServiceTagsPort {
  return {
    list: vi.fn(async () => [
      aServiceTag(),
      aServiceTag({
        key: "region",
        mode: "fixed",
        value: "eu",
        allowedValues: null,
        defaultValue: null,
        version: 1,
      }),
    ]),
    put: vi.fn(async (key: string) => aServiceTag({ key })),
    delete: vi.fn(async () => undefined),
    teamsMissing: vi.fn(async () => [
      { teamId: "team_9", displayName: "Gamma", keys: ["environment"] },
    ]),
    ...over,
  } as unknown as FakeServiceTagsPort;
}

export const aTagsView = (over: Partial<TeamTagsView> = {}): TeamTagsView => ({
  tags: [
    { key: "afs-team-id", source: "system", value: "team_1" },
    { key: "region", source: "service", value: "eu" },
    { key: "environment", source: "missing", value: undefined },
    { key: "cost-center", source: "team", value: "CC-1" },
  ],
  droppedKeys: [],
  version: 5,
  ...over,
});

export type FakeTagsPort = { [K in keyof TagsPort]: Mock<TagsPort[K]> };
export function fakeTagsPort(over: Partial<TagsPort> = {}): FakeTagsPort {
  return {
    get: vi.fn(async () => aTagsView()),
    put: vi.fn(async () => aTagsView()),
    ...over,
  } as unknown as FakeTagsPort;
}

export const tagsServices = (s: AdminServiceTagsPort, t: TagsPort) => ({
  adminServiceTags: new AdminServiceTagsUseCases(s),
  tags: new TagsUseCases(t),
});

export const aCostTagStatus = (over: Partial<CostTagStatusItem> = {}): CostTagStatusItem => ({
  key: "afs-team-id",
  seenInCur: true,
  firstSeenAt: "2026-10-02T00:00:00Z",
  lastSeenAt: "2026-11-20T00:00:00Z",
  awsStatus: "active",
  checkedAt: "2026-11-21T18:00:00Z",
  ...over,
});

export type FakeCostTagStatusPort = {
  [K in keyof AdminCostTagStatusPort]: Mock<AdminCostTagStatusPort[K]>;
};
export function fakeCostTagStatusPort(
  over: Partial<AdminCostTagStatusPort> = {},
): FakeCostTagStatusPort {
  return {
    list: vi.fn(async () => [aCostTagStatus()]),
    ...over,
  } as unknown as FakeCostTagStatusPort;
}

export const costTagStatusServices = (s: AdminCostTagStatusPort) => ({
  adminCostTagStatus: new AdminCostTagStatusUseCases(s),
});
