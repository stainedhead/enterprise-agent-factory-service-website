import { can, type Me } from "./me.js";
import type { Permission } from "./permission.js";
import type { ScreenId } from "./screens.js";

export type NavGroup =
  | "Service"
  | "Governance"
  | "Platform"
  | "Team"
  | "Configuration"
  | "Cost"
  | "History";

/** The team the caller is looking at, when the route has one. */
export interface NavTeam {
  readonly teamId: string;
  readonly kind?: "persistent" | "ephemeral";
}

export interface NavItem {
  readonly id: string;
  readonly group: NavGroup;
  readonly label: string;
  readonly screen: ScreenId;
  /** Screen shown instead for team viewers (V1, V2, V3). */
  readonly viewerScreen?: ScreenId;
  /** The permission whose absence selects the viewer screen; `agents:write` when not given. */
  readonly writePermission?: Permission;
  readonly route: string;
  readonly visibleWhen: (me: Me, team?: NavTeam) => boolean;
}

const serviceAdmin = (me: Me) => me.serviceAdmin;
const serviceAdminOrSecOp = (me: Me) => me.serviceAdmin || me.securityOperator;

/** A team item shows in a team context when the caller can read it there; with permission `p` if given. */
const teamItem =
  (p: Permission) =>
  (me: Me, team?: NavTeam): boolean =>
    team !== undefined && can(me, p, team.teamId);

export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: "dashboard",
    group: "Service",
    label: "Dashboard",
    screen: "S1",
    route: "/",
    visibleWhen: serviceAdmin,
  },
  {
    id: "teams",
    group: "Service",
    label: "Teams",
    screen: "S2",
    route: "/teams",
    visibleWhen: serviceAdmin,
  },
  {
    id: "work-orders",
    group: "Service",
    label: "Work orders",
    screen: "P3",
    route: "/work-orders",
    visibleWhen: serviceAdminOrSecOp,
  },

  {
    id: "budgets",
    group: "Governance",
    label: "Budgets & ceilings",
    screen: "S2",
    route: "/teams?view=budgets",
    visibleWhen: serviceAdmin,
  },
  {
    id: "cost-reconciliation",
    group: "Governance",
    label: "Cost reconciliation",
    screen: "S8",
    route: "/reports/reconciliation",
    visibleWhen: serviceAdmin,
  },
  {
    id: "cost-tags-service",
    group: "Governance",
    label: "Cost allocation tags",
    screen: "S9",
    route: "/cost-tags",
    visibleWhen: serviceAdmin,
  },
  {
    id: "audit-service",
    group: "Governance",
    label: "Audit log",
    screen: "S5",
    route: "/audit",
    visibleWhen: serviceAdmin,
  },

  {
    id: "models-catalog",
    group: "Platform",
    label: "Model catalog & pricing",
    screen: "S4",
    route: "/models",
    visibleWhen: serviceAdmin,
  },
  {
    id: "agent-templates",
    group: "Platform",
    label: "Agent templates",
    screen: "S10",
    route: "/settings/agent-templates",
    visibleWhen: serviceAdmin,
  },
  {
    id: "swarm-templates",
    group: "Platform",
    label: "Swarm templates",
    screen: "P5",
    route: "/swarm-templates",
    visibleWhen: serviceAdminOrSecOp,
  },
  {
    id: "orchestration-service",
    group: "Platform",
    label: "Orchestration",
    screen: "S12",
    route: "/orchestration",
    visibleWhen: serviceAdmin,
  },
  {
    id: "external-systems-catalog",
    group: "Platform",
    label: "External systems",
    screen: "S7",
    route: "/external-systems",
    visibleWhen: serviceAdmin,
  },
  {
    id: "service-settings",
    group: "Platform",
    label: "Service settings",
    screen: "S10",
    route: "/settings/general",
    visibleWhen: serviceAdmin,
  },
  {
    id: "export-import",
    group: "Platform",
    label: "Export & import",
    screen: "S11",
    route: "/export-import",
    visibleWhen: serviceAdmin,
  },

  {
    id: "overview",
    group: "Team",
    label: "Overview",
    screen: "T1",
    viewerScreen: "V1",
    route: "/t/:teamId",
    visibleWhen: teamItem("teams:read"),
  },
  {
    id: "orchestration",
    group: "Team",
    label: "Orchestration",
    screen: "T17",
    viewerScreen: "V4",
    writePermission: "collaboration:manage",
    route: "/t/:teamId/orchestration",
    visibleWhen: teamItem("collaboration:read"),
  },
  {
    id: "agents",
    group: "Team",
    label: "Agents",
    screen: "T2",
    route: "/t/:teamId/agents",
    visibleWhen: teamItem("agents:read"),
  },
  {
    id: "pools",
    group: "Team",
    label: "Pools & stages",
    screen: "P4",
    route: "/t/:teamId/pools",
    visibleWhen: (me, t) => t?.kind === "ephemeral" && can(me, "pools:read", t.teamId),
  },
  {
    id: "members",
    group: "Team",
    label: "Members & access",
    screen: "T6",
    route: "/t/:teamId/members",
    visibleWhen: teamItem("members:read"),
  },
  {
    id: "api-keys",
    group: "Team",
    label: "API keys",
    screen: "T6",
    route: "/t/:teamId/members/api-keys",
    visibleWhen: teamItem("api-keys:read"),
  },

  {
    id: "secrets",
    group: "Configuration",
    label: "Secrets",
    screen: "T4",
    viewerScreen: "V2",
    route: "/t/:teamId/secrets",
    visibleWhen: teamItem("secrets:read-metadata"),
  },
  {
    id: "identities",
    group: "Configuration",
    label: "Agent identities",
    screen: "T8",
    route: "/t/:teamId/identities",
    visibleWhen: teamItem("identities:read"),
  },
  {
    id: "external-systems",
    group: "Configuration",
    label: "External systems",
    screen: "T9",
    route: "/t/:teamId/external-systems",
    visibleWhen: teamItem("external-systems:read"),
  },
  {
    id: "team-models",
    group: "Configuration",
    label: "Models",
    screen: "T1",
    route: "/t/:teamId/models",
    visibleWhen: teamItem("models:read"),
  },
  {
    id: "log-delivery",
    group: "Configuration",
    label: "Log delivery",
    screen: "T14",
    route: "/t/:teamId/delivery/logs",
    visibleWhen: teamItem("logs:read"),
  },
  {
    id: "notifications",
    group: "Configuration",
    label: "Notifications",
    screen: "T14",
    route: "/t/:teamId/delivery/notifications",
    visibleWhen: teamItem("notifications:read"),
  },
  {
    id: "config-values",
    group: "Configuration",
    label: "Configuration values",
    screen: "T7",
    route: "/t/:teamId/config",
    visibleWhen: teamItem("config:read"),
  },

  {
    id: "budget",
    group: "Cost",
    label: "Budget & usage",
    screen: "T5",
    route: "/t/:teamId/budget",
    visibleWhen: teamItem("budgets:read"),
  },
  {
    id: "reports",
    group: "Cost",
    label: "Reports",
    screen: "T11",
    route: "/t/:teamId/reports",
    visibleWhen: teamItem("reports:read"),
  },
  {
    id: "cost-tags",
    group: "Cost",
    label: "Cost tags",
    screen: "T13",
    route: "/t/:teamId/tags",
    visibleWhen: teamItem("tags:read"),
  },

  {
    id: "history-audit",
    group: "History",
    label: "Activity & audit",
    screen: "T15",
    route: "/t/:teamId/history/audit",
    visibleWhen: teamItem("audit:read"),
  },
  {
    id: "history-revisions",
    group: "History",
    label: "Config revisions",
    screen: "T15",
    route: "/t/:teamId/history/revisions",
    visibleWhen: teamItem("revisions:read"),
  },
];

/** Routes that are not navigation items but still have a screen (details, create pages, S8 overview...). */
export const EXTRA_ROUTES: readonly { route: string; screen: ScreenId }[] = [
  { route: "/teams/new", screen: "S3" },
  { route: "/teams/:teamId/admin", screen: "S2" },
  { route: "/work-orders/new", screen: "P3" },
  { route: "/work-orders/:id", screen: "P6" },
  { route: "/reports", screen: "S8" },
  { route: "/settings/:section", screen: "S10" },
  { route: "/t/:teamId/orchestration/:tab", screen: "T17" },
  { route: "/orchestration/:tab", screen: "S12" },
  { route: "/t/:teamId/agents/new", screen: "T3" },
  { route: "/t/:teamId/agents/:agentId", screen: "T2" },
  { route: "/t/:teamId/reports/agents/:agentId", screen: "T12" },
  { route: "/t/:teamId/pools/new", screen: "P4" },
];

/** Old routes that move to a new place (ORC-20): `/t/:teamId/collaboration` is now *Orchestration*. */
export const REDIRECTS: readonly { from: string; to: string }[] = [
  { from: "/t/:teamId/collaboration", to: "/t/:teamId/orchestration" },
];

/** The tabs of the *Orchestration* page, in order; `collaboration` is the default and has no path segment. */
export const ORCHESTRATION_TABS = [
  { id: "collaboration", label: "Collaboration" },
  { id: "config", label: "Agent configuration" },
  { id: "usage", label: "Usage" },
  { id: "logs", label: "Logs" },
  { id: "revisions", label: "Revisions" },
] as const;
export type OrchestrationTab = (typeof ORCHESTRATION_TABS)[number]["id"];

/** The tabs of the service *Orchestration* page (S12). */
export const SERVICE_ORCHESTRATION_TABS = [
  { id: "endpoints", label: "Endpoints" },
  { id: "tools", label: "Tools and runtimes" },
  { id: "defaults", label: "Defaults" },
  { id: "kill-switches", label: "Kill switches" },
] as const;

/** Routes outside the navigation (PRD §4.1). */
export const SYSTEM_ROUTES = ["/sign-in", "/auth/callback", "/signed-out"] as const;

/** The groups shown in a context: service groups without a team, team groups with one. */
export function visibleItems(me: Me, team?: NavTeam): NavItem[] {
  return NAV_ITEMS.filter((i) => i.visibleWhen(me, team));
}

/** The screen for `item` given the caller's role in its team. */
export function screenFor(item: NavItem, me: Me, teamId?: string): ScreenId {
  if (!item.viewerScreen || !teamId) return item.screen;
  return can(me, item.writePermission ?? "agents:write", teamId) ? item.screen : item.viewerScreen;
}

/** Route with `:teamId` filled in. */
export function routeFor(item: NavItem, teamId?: string): string {
  return teamId ? item.route.replace(":teamId", teamId) : item.route;
}
