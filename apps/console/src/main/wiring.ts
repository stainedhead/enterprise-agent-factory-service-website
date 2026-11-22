import type { AfsClient } from "@afs/sdk";
import type { ClockPort } from "../application/ports/auth.js";
import { AdminAuditUseCases } from "../application/usecases/adminAudit/AdminAuditUseCases.js";
import {
  AdminAgentTemplatesUseCases,
  AdminStorageClassesUseCases,
} from "../application/usecases/adminCatalogs/AdminCatalogsUseCases.js";
import { AdminExportsUseCases } from "../application/usecases/adminExports/AdminExportsUseCases.js";
import {
  AdminModelsUseCases,
  AdminPricingUseCases,
} from "../application/usecases/adminModels/AdminModelsUseCases.js";
import { AdminNotificationChannelsUseCases } from "../application/usecases/adminNotificationChannels/AdminNotificationChannelsUseCases.js";
import { AdminOrgAccountsUseCases } from "../application/usecases/adminOrgAccounts/AdminOrgAccountsUseCases.js";
import { AdminServiceTagsUseCases } from "../application/usecases/adminServiceTags/AdminServiceTagsUseCases.js";
import { AgentsUseCases } from "../application/usecases/agents/AgentsUseCases.js";
import { CreateAgentUseCases } from "../application/usecases/agents-create/CreateAgentUseCases.js";
import { BudgetsUseCases } from "../application/usecases/budgets/BudgetsUseCases.js";
import { ConfigUseCases } from "../application/usecases/config/ConfigUseCases.js";
import { DashboardUseCases } from "../application/usecases/dashboard/DashboardUseCases.js";
import { AdminExternalSystemsUseCases } from "../application/usecases/externalSystems/AdminExternalSystemsUseCases.js";
import { ExternalSystemsUseCases } from "../application/usecases/externalSystems/ExternalSystemsUseCases.js";
import { HistoryUseCases } from "../application/usecases/history/HistoryUseCases.js";
import { IdentityUseCases } from "../application/usecases/identity/IdentityUseCases.js";
import { LogDestinationsUseCases } from "../application/usecases/logDestinations/LogDestinationsUseCases.js";
import {
  ApiKeysUseCases,
  MembersUseCases,
} from "../application/usecases/members/MembersUseCases.js";
import { NotificationsUseCases } from "../application/usecases/notifications/NotificationsUseCases.js";
import { OverviewUseCases } from "../application/usecases/overview/OverviewUseCases.js";
import { PoolsUseCases } from "../application/usecases/pools/PoolsUseCases.js";
import { ReportSchedulesUseCases } from "../application/usecases/reportSchedules/ReportSchedulesUseCases.js";
import { ReportsUseCases } from "../application/usecases/reports/ReportsUseCases.js";
import { SecretsUseCases } from "../application/usecases/secrets/SecretsUseCases.js";
import type { ListProviders } from "../application/usecases/session/ListProviders.js";
import {
  IdentityProvidersUseCases,
  SettingsUseCases,
} from "../application/usecases/settings/SettingsUseCases.js";
import { TagsUseCases } from "../application/usecases/tags/TagsUseCases.js";
import { TeamsUseCases } from "../application/usecases/teams/TeamsUseCases.js";
import { SdkAdminAudit } from "../infrastructure/sdk/adminAudit.js";
import {
  SdkAdminAgentTemplates,
  SdkAdminStorageClasses,
} from "../infrastructure/sdk/adminCatalogs.js";
import { SdkAdminExports } from "../infrastructure/sdk/adminExports.js";
import { SdkAdminModels, SdkAdminPricing } from "../infrastructure/sdk/adminModels.js";
import { SdkAdminNotificationChannels } from "../infrastructure/sdk/adminNotificationChannels.js";
import { SdkAdminOrgAccounts } from "../infrastructure/sdk/adminOrgAccounts.js";
import { SdkAdminServiceTags } from "../infrastructure/sdk/adminServiceTags.js";
import { SdkAgents } from "../infrastructure/sdk/agents.js";
import { SdkBudgets } from "../infrastructure/sdk/budgets.js";
import { SdkConfig } from "../infrastructure/sdk/config.js";
import { SdkDashboard } from "../infrastructure/sdk/dashboard.js";
import {
  SdkAdminExternalSystems,
  SdkExternalSystems,
} from "../infrastructure/sdk/externalSystems.js";
import { SdkAudit, SdkRevisions } from "../infrastructure/sdk/history.js";
import { SdkIdentity } from "../infrastructure/sdk/identity.js";
import { SdkLogDestinations } from "../infrastructure/sdk/logDestinations.js";
import { SdkApiKeys, SdkMembers } from "../infrastructure/sdk/members.js";
import { SdkNotifications } from "../infrastructure/sdk/notifications.js";
import { SdkOverview, SdkWorkOrders } from "../infrastructure/sdk/overview.js";
import { SdkPools } from "../infrastructure/sdk/pools.js";
import { SdkReportSchedules } from "../infrastructure/sdk/reportSchedules.js";
import { SdkReports } from "../infrastructure/sdk/reports.js";
import { SdkSecrets } from "../infrastructure/sdk/secrets.js";
import { SdkIdentityProviders, SdkSettings } from "../infrastructure/sdk/settings.js";
import { SdkTags } from "../infrastructure/sdk/tags.js";
import { SdkTeams } from "../infrastructure/sdk/teams.js";
import type { AppServices } from "../presentation/services.js";

// Shared list (architecture.md §3.2): one line per port. Unbuilt areas get notImplementedPort, which
// throws Unavailable on first use; M6-X1 fails while any remains.
export class NotImplementedError extends Error {
  readonly area: string;
  constructor(area: string) {
    super(`Port "${area}" is not implemented yet`);
    this.name = "NotImplementedError";
    this.area = area;
  }
}

export function notImplementedPort<T extends object>(area: string): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      if (prop === "then") return undefined;
      return () => {
        throw new NotImplementedError(area);
      };
    },
  });
}

/**
 * The use cases of every wired area (architecture §3.2: one line per area). An area that no stream has
 * wired yet is absent; `useService` then fails loudly, and M6-X1 checks that none is missing.
 */
export function buildServices(
  client: AfsClient,
  clock: Pick<ClockPort, "now">,
  shared: { listProviders: ListProviders },
): Partial<AppServices> {
  const teamsPort = new SdkTeams(client);
  const adminModelsPort = new SdkAdminModels(client);
  const overviewPort = new SdkOverview(client);
  const agentsUseCases = new AgentsUseCases(new SdkAgents(client));
  const configValues = new ConfigUseCases(new SdkConfig(client));
  return {
    signInProviders: shared.listProviders,
    agents: agentsUseCases,
    secrets: new SecretsUseCases(new SdkSecrets(client)),
    configValues,
    externalSystems: new ExternalSystemsUseCases(new SdkExternalSystems(client)),
    adminExternalSystems: new AdminExternalSystemsUseCases(new SdkAdminExternalSystems(client)),
    adminStorageClasses: new AdminStorageClassesUseCases(new SdkAdminStorageClasses(client)),
    adminAgentTemplates: new AdminAgentTemplatesUseCases(new SdkAdminAgentTemplates(client)),
    createAgent: new CreateAgentUseCases(agentsUseCases, configValues),
    teams: new TeamsUseCases(teamsPort, clock),
    adminModels: new AdminModelsUseCases(adminModelsPort, clock),
    adminPricing: new AdminPricingUseCases(new SdkAdminPricing(client), adminModelsPort, clock),
    identity: new IdentityUseCases(new SdkIdentity(client), {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    }),
    adminServiceTags: new AdminServiceTagsUseCases(new SdkAdminServiceTags(client)),
    tags: new TagsUseCases(new SdkTags(client)),
    adminOrgAccounts: new AdminOrgAccountsUseCases(new SdkAdminOrgAccounts(client)),
    adminAudit: new AdminAuditUseCases(new SdkAdminAudit(client)),
    adminExports: new AdminExportsUseCases(new SdkAdminExports(client)),
    reportSchedules: new ReportSchedulesUseCases(new SdkReportSchedules(client)),
    adminNotificationChannels: new AdminNotificationChannelsUseCases(
      new SdkAdminNotificationChannels(client),
    ),
    logDestinations: new LogDestinationsUseCases(new SdkLogDestinations(client)),
    notifications: new NotificationsUseCases(new SdkNotifications(client), {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    }),
    reports: new ReportsUseCases(new SdkReports(client), clock),
    pools: new PoolsUseCases(new SdkPools(client), new SdkAgents(client), new SdkReports(client)),
    budgets: new BudgetsUseCases(new SdkBudgets(client), clock),
    settings: new SettingsUseCases(new SdkSettings(client)),
    identityProviders: new IdentityProvidersUseCases(new SdkIdentityProviders(client)),
    history: new HistoryUseCases(new SdkAudit(client), new SdkRevisions(client)),
    members: new MembersUseCases(new SdkMembers(client)),
    apiKeys: new ApiKeysUseCases(new SdkApiKeys(client), clock),
    overview: new OverviewUseCases(overviewPort, new SdkWorkOrders(client)),
    dashboard: new DashboardUseCases(teamsPort, overviewPort, new SdkDashboard(client), clock),
  };
}
