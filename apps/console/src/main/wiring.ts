import type { AfsClient } from "@afs/sdk";
import type { ClockPort } from "../application/ports/auth.js";
import {
  AdminAgentTemplatesUseCases,
  AdminStorageClassesUseCases,
} from "../application/usecases/adminCatalogs/AdminCatalogsUseCases.js";
import { AgentsUseCases } from "../application/usecases/agents/AgentsUseCases.js";
import { CreateAgentUseCases } from "../application/usecases/agents-create/CreateAgentUseCases.js";
import { BudgetsUseCases } from "../application/usecases/budgets/BudgetsUseCases.js";
import { ConfigUseCases } from "../application/usecases/config/ConfigUseCases.js";
import { DashboardUseCases } from "../application/usecases/dashboard/DashboardUseCases.js";
import { AdminExternalSystemsUseCases } from "../application/usecases/externalSystems/AdminExternalSystemsUseCases.js";
import { ExternalSystemsUseCases } from "../application/usecases/externalSystems/ExternalSystemsUseCases.js";
import { HistoryUseCases } from "../application/usecases/history/HistoryUseCases.js";
import {
  ApiKeysUseCases,
  MembersUseCases,
} from "../application/usecases/members/MembersUseCases.js";
import { OverviewUseCases } from "../application/usecases/overview/OverviewUseCases.js";
import { SecretsUseCases } from "../application/usecases/secrets/SecretsUseCases.js";
import type { ListProviders } from "../application/usecases/session/ListProviders.js";
import {
  IdentityProvidersUseCases,
  SettingsUseCases,
} from "../application/usecases/settings/SettingsUseCases.js";
import { TeamsUseCases } from "../application/usecases/teams/TeamsUseCases.js";
import {
  SdkAdminAgentTemplates,
  SdkAdminStorageClasses,
} from "../infrastructure/sdk/adminCatalogs.js";

import { SdkAgents } from "../infrastructure/sdk/agents.js";
import { SdkBudgets } from "../infrastructure/sdk/budgets.js";
import { SdkConfig } from "../infrastructure/sdk/config.js";
import { SdkDashboard } from "../infrastructure/sdk/dashboard.js";
import {
  SdkAdminExternalSystems,
  SdkExternalSystems,
} from "../infrastructure/sdk/externalSystems.js";
import { SdkAudit, SdkRevisions } from "../infrastructure/sdk/history.js";
import { SdkApiKeys, SdkMembers } from "../infrastructure/sdk/members.js";
import { SdkOverview, SdkWorkOrders } from "../infrastructure/sdk/overview.js";
import { SdkSecrets } from "../infrastructure/sdk/secrets.js";
import { SdkIdentityProviders, SdkSettings } from "../infrastructure/sdk/settings.js";
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
