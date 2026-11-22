import { type Mock, vi } from "vitest";
import type { OverviewPort } from "../../application/ports/overview.js";
import type { TeamRecord, TeamsPort } from "../../application/ports/teams.js";
import { OverviewUseCases } from "../../application/usecases/overview/OverviewUseCases.js";
import { ListProviders } from "../../application/usecases/session/ListProviders.js";
import { TeamsUseCases } from "../../application/usecases/teams/TeamsUseCases.js";
import type { Me } from "../../domain/me.js";
import { PERMISSIONS, type Permission } from "../../domain/permission.js";
import type { AppServices } from "../services.js";

export const status = (phase = "Ready", observed = 1) => ({
  phase,
  observedGeneration: observed,
  conditions: [],
  updatedAt: "2026-11-21T18:00:00Z",
});

export const aTeam = (over: Partial<TeamRecord> = {}): TeamRecord => ({
  id: "team_1",
  slug: "alpha",
  displayName: "Alpha",
  kind: "persistent",
  state: "active",
  namespace: "afs-alpha",
  generation: 1,
  version: 3,
  status: status(),
  maxBudgetUsd: "1000.00",
  effectiveCeilingUsd: "1000.00",
  isolationTier: "shared",
  viewerKubectl: false,
  mayAddExternalSystems: false,
  mayManageAwsAccounts: false,
  allowedAwsAccounts: [],
  costCenter: "CC-1",
  ...over,
});

/** A fake teams port: every method is a spy with a harmless default. */
/** Every method of the port as a spy. */
export type FakeTeamsPort = { [K in keyof TeamsPort]: Mock<TeamsPort[K]> };

export function fakeTeamsPort(over: Partial<TeamsPort> = {}): FakeTeamsPort {
  const port = {
    list: vi.fn(async () => ({ items: [aTeam()] })),
    get: vi.fn(async () => aTeam()),
    create: vi.fn(async () => aTeam()),
    update: vi.fn(async () => aTeam()),
    delete: vi.fn(async () => aTeam({ state: "deleting" })),
    suspend: vi.fn(async () => aTeam({ state: "suspended" })),
    resume: vi.fn(async () => aTeam()),
    status: vi.fn(async () => status()),
    models: vi.fn(async () => []),
    putModels: vi.fn(async () => []),
    tags: vi.fn(async () => ({ tags: [] })),
    putTags: vi.fn(async () => ({ tags: [] })),
    catalogModels: vi.fn(async () => [
      { id: "m1", displayName: "Model One", provider: "p", enabled: true },
    ]),
    serviceTags: vi.fn(async () => []),
    spendByTeam: vi.fn(async () => ({ team_1: { costUsd: "250.00" } })),
    ...over,
  };
  return port as unknown as FakeTeamsPort;
}

export function teamsServices(
  port: TeamsPort,
  opts: { providers?: { id: string; name: string; isDefault: boolean }[] } = {},
) {
  const providers = (opts.providers ?? []).map((p) => ({
    ...p,
    kind: "okta",
    issuerUrl: "https://idp.example",
    consoleClientId: "c",
  }));
  return {
    teams: new TeamsUseCases(port, { now: () => Date.parse("2026-11-22T00:00:00Z") }),
    signInProviders: new ListProviders({ list: async () => providers }, providers),
  };
}

/** A service admin whose service permissions are limited to `perms` (denied-case tests). */
export const serviceAdminWith = (perms: readonly Permission[]): Me => ({
  principal: { id: "usr_a", type: "user", name: "Sam" },
  serviceAdmin: true,
  securityOperator: false,
  servicePermissions: perms,
  teams: [],
});

export const ALL_PERMS: readonly Permission[] = PERMISSIONS;

/** Empty-but-working services for tests that render the real routes but are not about a screen's data. */
export function shellScreenServices(): Partial<AppServices> {
  const overview: OverviewPort = {
    budget: async () => ({
      amountUsd: "0.00",
      spentUsd: "0.00",
      reservedUsd: "0.00",
      period: "monthly",
      onExhaust: "block",
      thresholds: [],
      version: 1,
    }),
    agents: async () => [],
    recentActivity: async () => [],
  };
  return {
    ...teamsServices(fakeTeamsPort()),
    overview: new OverviewUseCases(overview, { listForTeam: async () => ({ items: [] }) }),
  };
}
