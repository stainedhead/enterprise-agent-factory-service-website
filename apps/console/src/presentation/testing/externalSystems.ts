import { type Mock, vi } from "vitest";
import type { AdminExternalSystemsPort } from "../../application/ports/adminExternalSystems.js";
import type {
  ExternalSystemRecord,
  ExternalSystemsPort,
} from "../../application/ports/externalSystems.js";
import { AdminExternalSystemsUseCases } from "../../application/usecases/externalSystems/AdminExternalSystemsUseCases.js";
import { ExternalSystemsUseCases } from "../../application/usecases/externalSystems/ExternalSystemsUseCases.js";

export const aSystem = (over: Partial<ExternalSystemRecord> = {}): ExternalSystemRecord => ({
  id: "ext_1",
  name: "GitHub",
  slug: "github",
  category: "dev_tools",
  endpoints: ["api.github.com"],
  enabled: true,
  builtin: true,
  scope: "service",
  unmetered: false,
  teamState: "on",
  disabledAt: null,
  version: 1,
  ...over,
});

export type FakeExternalSystemsPort = {
  [K in keyof ExternalSystemsPort]: Mock<ExternalSystemsPort[K]>;
};

export function fakeExternalSystemsPort(
  over: Partial<ExternalSystemsPort> = {},
): FakeExternalSystemsPort {
  const list = async () => [
    aSystem(),
    aSystem({ id: "ext_2", name: "Slack", slug: "slack", category: "collaboration" }),
    aSystem({ id: "ext_3", name: "Jira", slug: "jira", enabled: false, disabledAt: "service" }),
    aSystem({
      id: "ext_4",
      name: "OpenAI API",
      slug: "openai",
      category: "llm",
      unmetered: true,
      builtin: false,
    }),
    aSystem({
      id: "ext_5",
      name: "Internal CI",
      slug: "internal-ci",
      scope: "team",
      builtin: false,
      owner: "ops",
      purpose: "builds",
    }),
  ];
  return {
    listTeam: vi.fn(list),
    declare: vi.fn(async () => aSystem({ id: "ext_9", scope: "team", builtin: false })),
    updateTeam: vi.fn(async () => aSystem({ scope: "team" })),
    deleteTeam: vi.fn(async () => undefined),
    setTeamState: vi.fn(async () => aSystem()),
    listAgent: vi.fn(list),
    setAgentState: vi.fn(async () => aSystem()),
    ...over,
  } as unknown as FakeExternalSystemsPort;
}

export const externalSystemsServices = (p: ExternalSystemsPort) => ({
  externalSystems: new ExternalSystemsUseCases(p),
});

export type FakeAdminExternalSystemsPort = {
  [K in keyof AdminExternalSystemsPort]: Mock<AdminExternalSystemsPort[K]>;
};

export function fakeAdminExternalSystemsPort(
  over: Partial<AdminExternalSystemsPort> = {},
): FakeAdminExternalSystemsPort {
  return {
    list: vi.fn(async () => [
      aSystem(),
      aSystem({ id: "ext_3", name: "Jira", slug: "jira", enabled: false }),
      aSystem({
        id: "ext_4",
        name: "OpenAI API",
        slug: "openai",
        enabled: false,
        unmetered: true,
        builtin: false,
      }),
    ]),
    create: vi.fn(async () => aSystem({ id: "ext_9", builtin: false })),
    update: vi.fn(async () => aSystem()),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeAdminExternalSystemsPort;
}

export const adminExternalSystemsServices = (p: AdminExternalSystemsPort) => ({
  adminExternalSystems: new AdminExternalSystemsUseCases(p),
});
