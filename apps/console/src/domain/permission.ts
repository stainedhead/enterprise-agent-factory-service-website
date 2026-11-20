/**
 * Roles and permissions, mirroring internal/authz in enterprise-agent-factory-service-restapi.
 * Used only to shape the UI (hide or disable controls). The API is the enforcement point.
 */
export type Role = "service_admin" | "team_admin" | "team_viewer";

export type Permission =
  | "teams:create"
  | "teams:delete"
  | "teams:read"
  | "teams:write"
  | "teams:suspend"
  | "agents:read"
  | "agents:write"
  | "members:read"
  | "members:write"
  | "secrets:read-metadata"
  | "secrets:write"
  | "identities:read"
  | "identities:write"
  | "budgets:read"
  | "budgets:write"
  | "budgets:set-ceiling"
  | "usage:read"
  | "logs:read"
  | "logs:write"
  | "notifications:read"
  | "notifications:write"
  | "api-keys:write"
  | "audit:read"
  | "admin:settings"
  | "admin:models"
  | "admin:export"
  | "admin:audit";

export interface Binding {
  role: Role;
  /** Absent for service_admin. */
  teamId?: string;
}

export interface Principal {
  subject: string;
  displayName: string;
  bindings: readonly Binding[];
}

const VIEWER: readonly Permission[] = [
  "teams:read",
  "agents:read",
  "members:read",
  "secrets:read-metadata",
  "identities:read",
  "budgets:read",
  "usage:read",
  "logs:read",
  "notifications:read",
  "audit:read",
];

const TEAM_ADMIN: readonly Permission[] = [
  ...VIEWER,
  "teams:write",
  "teams:suspend",
  "agents:write",
  "members:write",
  "secrets:write",
  "identities:write",
  "budgets:write",
  "logs:write",
  "notifications:write",
  "api-keys:write",
];

const ROLE_PERMISSIONS: Record<Exclude<Role, "service_admin">, readonly Permission[]> = {
  team_admin: TEAM_ADMIN,
  team_viewer: VIEWER,
};

/** Whether the principal may perform `permission` on `teamId` ("" for service-level actions). */
export function can(principal: Principal, permission: Permission, teamId = ""): boolean {
  return principal.bindings.some((b) => {
    if (b.role === "service_admin") return b.teamId === undefined;
    return (
      b.teamId !== undefined && b.teamId === teamId && ROLE_PERMISSIONS[b.role].includes(permission)
    );
  });
}

export function isServiceAdmin(principal: Principal): boolean {
  return principal.bindings.some((b) => b.role === "service_admin" && b.teamId === undefined);
}
