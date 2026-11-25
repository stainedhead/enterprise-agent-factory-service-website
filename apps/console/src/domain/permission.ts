/**
 * The permission catalog, mirroring `internal/authz` in -restapi through the pinned
 * `permissions.json` (drift-tested in permission.test.ts). Used only to shape the UI; the API is the
 * enforcement point.
 */
export type Role =
  | "team_viewer"
  | "team_collaborator"
  | "team_admin"
  | "service_admin"
  | "security_operator";

export type Condition =
  | "assignedOrOwnRepos"
  | "mayManageAwsAccounts"
  | "assignedTeam"
  | "viewerKubectl"
  | "mcpApprovalPolicy";

export interface Grant {
  readonly role: Role | "workload";
  readonly condition?: Condition;
}

export interface CatalogEntry {
  readonly permission: Permission;
  readonly grants: readonly Grant[];
}

export const CATALOG = [
  {
    permission: "teams:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "teams:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  { permission: "teams:suspend", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  { permission: "teams:create", grants: [{ role: "service_admin" }] },
  { permission: "teams:delete", grants: [{ role: "service_admin" }] },
  { permission: "teams:set-guardrails", grants: [{ role: "service_admin" }] },
  {
    permission: "teams:set-aws-accounts",
    grants: [{ role: "team_admin", condition: "mayManageAwsAccounts" }, { role: "service_admin" }],
  },
  {
    permission: "teams:read-directory",
    grants: [{ role: "service_admin" }, { role: "security_operator" }],
  },
  {
    permission: "members:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "members:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  { permission: "api-keys:read", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  { permission: "api-keys:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "agents:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "agents:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "secrets:read-metadata",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "secrets:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "config:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "config:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "identities:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "identities:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "external-systems:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  {
    permission: "external-systems:write",
    grants: [{ role: "team_admin" }, { role: "service_admin" }],
  },
  {
    permission: "budgets:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "budgets:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "usage:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  {
    permission: "reports:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "reports:schedule", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "tags:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "tags:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "logs:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "logs:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "notifications:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  {
    permission: "notifications:write",
    grants: [{ role: "team_admin" }, { role: "service_admin" }],
  },
  {
    permission: "audit:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  {
    permission: "revisions:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "revisions:restore", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "models:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "admin:settings", grants: [{ role: "service_admin" }] },
  { permission: "admin:models", grants: [{ role: "service_admin" }] },
  { permission: "admin:pricing", grants: [{ role: "service_admin" }] },
  { permission: "admin:identity-providers", grants: [{ role: "service_admin" }] },
  { permission: "admin:service-tags", grants: [{ role: "service_admin" }] },
  { permission: "admin:external-systems", grants: [{ role: "service_admin" }] },
  { permission: "admin:storage-classes", grants: [{ role: "service_admin" }] },
  { permission: "admin:agent-templates", grants: [{ role: "service_admin" }] },
  { permission: "admin:accounts", grants: [{ role: "service_admin" }] },
  { permission: "admin:reports", grants: [{ role: "service_admin" }] },
  { permission: "admin:audit", grants: [{ role: "service_admin" }] },
  { permission: "admin:export", grants: [{ role: "service_admin" }] },
  {
    permission: "pools:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  { permission: "pools:write", grants: [{ role: "team_admin" }, { role: "service_admin" }] },
  {
    permission: "teams:get-kubeconfig",
    grants: [
      { role: "team_viewer", condition: "viewerKubectl" },
      { role: "team_admin", condition: "viewerKubectl" },
      { role: "service_admin" },
      { role: "team_collaborator", condition: "viewerKubectl" },
    ],
  },
  {
    permission: "work-orders:read",
    grants: [
      { role: "team_viewer", condition: "assignedOrOwnRepos" },
      { role: "team_admin", condition: "assignedOrOwnRepos" },
      { role: "service_admin" },
      { role: "security_operator" },
      { role: "team_collaborator", condition: "assignedOrOwnRepos" },
    ],
  },
  {
    permission: "work-orders:write",
    grants: [{ role: "service_admin" }, { role: "security_operator" }],
  },
  {
    permission: "work-orders:report",
    grants: [{ role: "team_admin", condition: "assignedTeam" }, { role: "service_admin" }],
  },
  {
    permission: "swarm-templates:read",
    grants: [{ role: "service_admin" }, { role: "security_operator" }],
  },
  { permission: "admin:swarm-templates", grants: [{ role: "service_admin" }] },
  { permission: "admin:cost-tag-status", grants: [{ role: "service_admin" }] },
  { permission: "admin:model-endpoints", grants: [{ role: "service_admin" }] },
  { permission: "admin:inference-providers", grants: [{ role: "service_admin" }] },
  {
    permission: "model-endpoints:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  {
    permission: "model-endpoints:write",
    grants: [{ role: "team_admin" }, { role: "service_admin" }],
  },
  {
    permission: "mcp-servers:read",
    grants: [{ role: "service_admin" }, { role: "security_operator" }],
  },
  {
    permission: "mcp-servers:review",
    grants: [{ role: "service_admin" }, { role: "security_operator" }],
  },
  {
    permission: "mcp-servers:suspend",
    grants: [{ role: "service_admin" }, { role: "security_operator" }],
  },
  { permission: "mcp-servers:write", grants: [{ role: "service_admin" }] },
  { permission: "mcp-settings:write", grants: [{ role: "service_admin" }] },
  {
    permission: "team-mcp-servers:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "team_collaborator" },
    ],
  },
  {
    permission: "team-mcp-servers:write",
    grants: [{ role: "team_admin" }, { role: "service_admin" }],
  },
  {
    permission: "team-mcp-servers:approve",
    grants: [{ role: "team_admin", condition: "mcpApprovalPolicy" }, { role: "service_admin" }],
  },
  {
    permission: "mcp-events:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_admin" },
      { role: "service_admin" },
      { role: "security_operator" },
      { role: "team_collaborator" },
    ],
  },
  {
    permission: "agent-federated-identities:write",
    grants: [{ role: "team_admin" }, { role: "service_admin" }],
  },
  {
    permission: "collaboration:read",
    grants: [
      { role: "team_viewer" },
      { role: "team_collaborator" },
      { role: "team_admin" },
      { role: "service_admin" },
    ],
  },
  {
    permission: "collaboration:manage",
    grants: [{ role: "team_admin" }, { role: "service_admin" }],
  },
  {
    permission: "collaboration:access",
    grants: [
      { role: "team_viewer" },
      { role: "team_collaborator" },
      { role: "team_admin" },
      { role: "service_admin" },
    ],
  },
  {
    permission: "collaboration:contribute",
    grants: [{ role: "team_collaborator" }, { role: "team_admin" }, { role: "service_admin" }],
  },
  {
    permission: "collaboration:api",
    grants: [{ role: "team_collaborator" }, { role: "team_admin" }, { role: "service_admin" }],
  },
] as const satisfies readonly { permission: string; grants: readonly Grant[] }[];

/**
 * Every permission of the contract (77; v1.5.0 adds the four model endpoint permissions, v1.6.0 the ten MCP and
 * federated identity permissions).
 */
export type Permission = (typeof CATALOG)[number]["permission"];

/** The catalog with its wide type, for iteration. */
export const ENTRIES: readonly CatalogEntry[] = CATALOG;

export const PERMISSIONS: readonly Permission[] = CATALOG.map((e) => e.permission);

export type RoleLabel =
  | "team viewer"
  | "team-collaborator"
  | "team-admin"
  | "service admin"
  | "security operator";

const LABELS: Record<Role, RoleLabel> = {
  team_viewer: "team viewer",
  team_collaborator: "team-collaborator",
  team_admin: "team-admin",
  service_admin: "service admin",
  security_operator: "security operator",
};

/** The roles that hold `permission` unconditionally, in ascending order of privilege. */
export function rolesGranting(permission: Permission): Role[] {
  const entry = CATALOG.find((e) => e.permission === permission);
  if (!entry) return [];
  const order: Role[] = [
    "team_viewer",
    "team_collaborator",
    "team_admin",
    "service_admin",
    "security_operator",
  ];
  return order.filter((r) =>
    (entry.grants as readonly Grant[]).some((g) => g.role === r && g.condition === undefined),
  );
}

/**
 * The lowest role that grants `permission` unconditionally, for the "Requires <role>" tooltip.
 * Conditional grants name the service admin, who holds the permission without the condition.
 */
export function requiredRoleLabel(permission: Permission): RoleLabel {
  const roles = rolesGranting(permission);
  const lowest = roles.find((r) => r !== "security_operator") ?? roles[0] ?? "service_admin";
  return LABELS[lowest];
}

/** Whether the security operator column grants `permission`. */
export function securityOperatorGrants(permission: Permission): boolean {
  return CATALOG.some(
    (e) =>
      e.permission === permission &&
      (e.grants as readonly Grant[]).some(
        (g) => g.role === "security_operator" && g.condition === undefined,
      ),
  );
}
