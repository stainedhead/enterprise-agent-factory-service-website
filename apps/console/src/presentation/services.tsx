// The use cases a screen may call, built once in main/wiring.ts (architecture §3.2: one line per area).
import { createContext, useContext } from "react";
import type { AdminApiKeysUseCases } from "../application/usecases/adminApiKeys/AdminApiKeysUseCases.js";
import type { AdminAuditUseCases } from "../application/usecases/adminAudit/AdminAuditUseCases.js";
import type {
  AdminAgentTemplatesUseCases,
  AdminStorageClassesUseCases,
} from "../application/usecases/adminCatalogs/AdminCatalogsUseCases.js";
import type { AdminCostTagStatusUseCases } from "../application/usecases/adminCostTagStatus/AdminCostTagStatusUseCases.js";
import type { AdminExportsUseCases } from "../application/usecases/adminExports/AdminExportsUseCases.js";
import type {
  AdminModelsUseCases,
  AdminPricingUseCases,
} from "../application/usecases/adminModels/AdminModelsUseCases.js";
import type { AdminNotificationChannelsUseCases } from "../application/usecases/adminNotificationChannels/AdminNotificationChannelsUseCases.js";
import type { AdminOrgAccountsUseCases } from "../application/usecases/adminOrgAccounts/AdminOrgAccountsUseCases.js";
import type { AdminSecurityOperatorsUseCases } from "../application/usecases/adminSecurityOperators/AdminSecurityOperatorsUseCases.js";
import type { AdminServiceTagsUseCases } from "../application/usecases/adminServiceTags/AdminServiceTagsUseCases.js";
import type { AgentsUseCases } from "../application/usecases/agents/AgentsUseCases.js";
import type { CreateAgentUseCases } from "../application/usecases/agents-create/CreateAgentUseCases.js";
import type { BudgetsUseCases } from "../application/usecases/budgets/BudgetsUseCases.js";
import type { CollaborationUseCases } from "../application/usecases/collaboration/CollaborationUseCases.js";
import type { ConfigUseCases } from "../application/usecases/config/ConfigUseCases.js";
import type { DashboardUseCases } from "../application/usecases/dashboard/DashboardUseCases.js";
import type { AdminExternalSystemsUseCases } from "../application/usecases/externalSystems/AdminExternalSystemsUseCases.js";
import type { ExternalSystemsUseCases } from "../application/usecases/externalSystems/ExternalSystemsUseCases.js";
import type { HistoryUseCases } from "../application/usecases/history/HistoryUseCases.js";
import type { IdentityUseCases } from "../application/usecases/identity/IdentityUseCases.js";
import type { LogDestinationsUseCases } from "../application/usecases/logDestinations/LogDestinationsUseCases.js";
import type {
  ApiKeysUseCases,
  MembersUseCases,
} from "../application/usecases/members/MembersUseCases.js";
import type { NotificationsUseCases } from "../application/usecases/notifications/NotificationsUseCases.js";
import type { OrchestrationUseCases } from "../application/usecases/orchestration/OrchestrationUseCases.js";
import type { OverviewUseCases } from "../application/usecases/overview/OverviewUseCases.js";
import type { PoolsUseCases } from "../application/usecases/pools/PoolsUseCases.js";
import type { ReportSchedulesUseCases } from "../application/usecases/reportSchedules/ReportSchedulesUseCases.js";
import type { ReportsUseCases } from "../application/usecases/reports/ReportsUseCases.js";
import type { SecretsUseCases } from "../application/usecases/secrets/SecretsUseCases.js";
import type { ListProviders } from "../application/usecases/session/ListProviders.js";
import type {
  IdentityProvidersUseCases,
  SettingsUseCases,
} from "../application/usecases/settings/SettingsUseCases.js";
import type { SwarmTemplatesUseCases } from "../application/usecases/swarmTemplates/SwarmTemplatesUseCases.js";
import type { TagsUseCases } from "../application/usecases/tags/TagsUseCases.js";
import type { TeamDirectoryUseCases } from "../application/usecases/teamDirectory/TeamDirectoryUseCases.js";
import type { TeamsUseCases } from "../application/usecases/teams/TeamsUseCases.js";
import type { WorkOrdersUseCases } from "../application/usecases/workOrders/WorkOrdersUseCases.js";

export interface AppServices {
  readonly agents: AgentsUseCases;
  readonly configValues: ConfigUseCases;
  readonly createAgent: CreateAgentUseCases;
  readonly externalSystems: ExternalSystemsUseCases;
  readonly adminExternalSystems: AdminExternalSystemsUseCases;
  readonly adminStorageClasses: AdminStorageClassesUseCases;
  readonly adminAgentTemplates: AdminAgentTemplatesUseCases;
  readonly adminModels: AdminModelsUseCases;
  readonly adminPricing: AdminPricingUseCases;
  readonly budgets: BudgetsUseCases;
  readonly collaboration: CollaborationUseCases;
  readonly orchestration: OrchestrationUseCases;
  readonly reports: ReportsUseCases;
  readonly identity: IdentityUseCases;
  readonly adminCostTagStatus: AdminCostTagStatusUseCases;
  readonly workOrders: WorkOrdersUseCases;
  readonly teamDirectory: TeamDirectoryUseCases;
  readonly swarmTemplates: SwarmTemplatesUseCases;
  readonly adminServiceTags: AdminServiceTagsUseCases;
  readonly tags: TagsUseCases;
  readonly adminOrgAccounts: AdminOrgAccountsUseCases;
  readonly adminAudit: AdminAuditUseCases;
  readonly adminExports: AdminExportsUseCases;
  readonly pools: PoolsUseCases;
  readonly reportSchedules: ReportSchedulesUseCases;
  readonly adminNotificationChannels: AdminNotificationChannelsUseCases;
  readonly logDestinations: LogDestinationsUseCases;
  readonly notifications: NotificationsUseCases;
  readonly secrets: SecretsUseCases;
  readonly history: HistoryUseCases;
  readonly identityProviders: IdentityProvidersUseCases;
  readonly settings: SettingsUseCases;
  readonly dashboard: DashboardUseCases;
  readonly apiKeys: ApiKeysUseCases;
  readonly adminApiKeys: AdminApiKeysUseCases;
  readonly adminSecurityOperators: AdminSecurityOperatorsUseCases;
  readonly members: MembersUseCases;
  readonly overview: OverviewUseCases;
  readonly teams: TeamsUseCases;
  /** The sign-in providers a team may be bound to (S3, T1, T6). */
  readonly signInProviders: ListProviders;
}

export const ServicesContext = createContext<Partial<AppServices>>({});

/** One area's use cases; a screen whose area is not wired fails loudly rather than rendering empty. */
export function useService<K extends keyof AppServices>(area: K): AppServices[K] {
  const s = useContext(ServicesContext)[area];
  if (!s) throw new Error(`Service "${area}" is not wired in main/wiring.ts`);
  return s;
}

/** Like {@link useService} but returns undefined when the area is not wired (shell parts that must not crash). */
export function useOptionalService<K extends keyof AppServices>(
  area: K,
): AppServices[K] | undefined {
  return useContext(ServicesContext)[area];
}
