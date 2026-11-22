// Shared list: one fixture module per area, added by the area stream.
import type { SeedUser } from "../users.js";
import { adminCatalogsFixtures, resetAdminCatalogs } from "./admin-catalogs.js";
import { adminExternalSystemsFixtures } from "./admin-externalSystems.js";
import { adminModelsFixtures, resetAdminModels } from "./admin-models.js";
import { agentsFixtures, resetAgents } from "./agents.js";
import { budgetsFixtures, resetBudgets } from "./budgets.js";
import { configFixtures, resetConfig } from "./config.js";
import { coreFixtures } from "./core.js";
import { dashboardFixtures } from "./dashboard.js";
import { externalSystemsFixtures, resetExternalSystems } from "./externalSystems.js";
import { historyFixtures } from "./history.js";
import { membersFixtures, resetMembers } from "./members.js";
import { overviewFixtures, resetOverview } from "./overview.js";
import { resetSecrets, secretsFixtures } from "./secrets.js";
import { resetSettings, settingsFixtures } from "./settings.js";
import { resetTeams, teamsFixtures } from "./teams.js";

export interface FixtureContext {
  readonly principal: SeedUser | undefined;
  readonly params: Readonly<Record<string, string>>;
  readonly query: URLSearchParams;
  readonly body: unknown;
  /** Per-server settings a fixture may need, such as the fake IdP's issuer URL. */
  readonly config: { readonly idpIssuer: string };
}

export interface FixtureResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

/** A canned answer for one operation. The body is validated against the pinned OpenAPI. */
export interface Fixture {
  readonly method: string;
  /** OpenAPI path template, for example `/v1/teams/{teamId}`. */
  readonly path: string;
  readonly response: FixtureResponse | ((ctx: FixtureContext) => FixtureResponse);
}

export const fixtureModules: readonly (readonly Fixture[])[] = [
  coreFixtures,
  agentsFixtures,
  secretsFixtures,
  configFixtures,
  externalSystemsFixtures,
  adminExternalSystemsFixtures,
  adminCatalogsFixtures,
  teamsFixtures,
  overviewFixtures,
  membersFixtures,
  dashboardFixtures,
  settingsFixtures,
  historyFixtures,
  budgetsFixtures,
  adminModelsFixtures,
];

/** Stateful fixture modules register a reset here; the server calls them on `/__reset`. */
export const fixtureResets: readonly (() => void)[] = [
  resetTeams,
  resetAgents,
  resetSecrets,
  resetConfig,
  resetExternalSystems,
  resetAdminCatalogs,
  resetOverview,
  resetMembers,
  resetSettings,
  resetBudgets,
  resetAdminModels,
];
