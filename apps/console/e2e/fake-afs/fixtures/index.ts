// Shared list: one fixture module per area, added by the area stream.
import type { SeedUser } from "../users.js";
import { adminApiKeysFixtures, resetAdminApiKeys } from "./admin-apiKeys.js";
import { adminAuditFixtures } from "./admin-audit.js";
import { adminCatalogsFixtures, resetAdminCatalogs } from "./admin-catalogs.js";
import { adminCostTagStatusFixtures } from "./admin-costTagStatus.js";
import { adminExportsFixtures, resetAdminExports } from "./admin-exports.js";
import { adminExternalSystemsFixtures } from "./admin-externalSystems.js";
import { adminModelsFixtures, resetAdminModels } from "./admin-models.js";
import {
  adminNotificationChannelsFixtures,
  resetAdminNotificationChannels,
} from "./admin-notificationChannels.js";
import { adminOrgAccountsFixtures } from "./admin-orgAccounts.js";
import { adminServiceTagsFixtures, resetAdminServiceTags } from "./admin-serviceTags.js";
import { agentsFixtures, resetAgents } from "./agents.js";
import { budgetsFixtures, resetBudgets } from "./budgets.js";
import { collaborationFixtures, resetCollaboration } from "./collaboration.js";
import { configFixtures, resetConfig } from "./config.js";
import { coreFixtures } from "./core.js";
import { dashboardFixtures } from "./dashboard.js";
import { externalSystemsFixtures, resetExternalSystems } from "./externalSystems.js";
import { historyFixtures, resetHistory } from "./history.js";
import { identityFixtures, resetIdentity } from "./identity.js";
import { logDestinationsFixtures, resetLogDestinations } from "./logDestinations.js";
import { membersFixtures, resetMembers } from "./members.js";
import { notificationsFixtures, resetNotifications } from "./notifications.js";
import { overviewFixtures, resetOverview } from "./overview.js";
import { poolsFixtures, resetPools } from "./pools.js";
import { reportSchedulesFixtures, resetReportSchedules } from "./reportSchedules.js";
import { reportsFixtures } from "./reports.js";
import { resetSecrets, secretsFixtures } from "./secrets.js";
import { resetSettings, settingsFixtures } from "./settings.js";
import { resetSwarmTemplates, swarmTemplatesFixtures } from "./swarmTemplates.js";
import { resetTeams, teamsFixtures } from "./teams.js";
import { resetWorkOrders, workOrdersFixtures } from "./workOrders.js";

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
  /** The body served instead of JSON when the request's `Accept` includes `text/csv` (CSV operations). */
  csv?: string;
  /** A raw text body (for example `application/yaml`), served as is and not validated against the contract. */
  text?: string;
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
  reportsFixtures,
  notificationsFixtures,
  adminAuditFixtures,
  adminOrgAccountsFixtures,
  adminServiceTagsFixtures,
  adminCostTagStatusFixtures,
  workOrdersFixtures,
  swarmTemplatesFixtures,
  identityFixtures,
  logDestinationsFixtures,
  adminExportsFixtures,
  reportSchedulesFixtures,
  adminNotificationChannelsFixtures,
  poolsFixtures,
  adminApiKeysFixtures,
  collaborationFixtures,
];

/** Stateful fixture modules register a reset here; the server calls them on `/__reset`. */
export const fixtureResets: readonly (() => void)[] = [
  resetTeams,
  resetNotifications,
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
  resetIdentity,
  resetAdminServiceTags,
  resetLogDestinations,
  resetAdminExports,
  resetHistory,
  resetReportSchedules,
  resetAdminNotificationChannels,
  resetPools,
  resetWorkOrders,
  resetSwarmTemplates,
  resetAdminApiKeys,
  resetCollaboration,
];
