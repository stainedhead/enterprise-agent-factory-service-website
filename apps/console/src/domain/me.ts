import { type Permission, securityOperatorGrants } from "./permission.js";

export interface Principal {
  readonly id: string;
  readonly type: "user" | "api_key" | "workload";
  readonly email?: string;
  readonly name?: string;
}

export interface MeTeam {
  readonly teamId: string;
  readonly slug: string;
  readonly role: "team_admin" | "team_viewer" | "workload";
  readonly permissions: readonly Permission[];
}

/** The caller, as `GET /v1/me` returns it (contract §5, plus `servicePermissions`, F-1). */
export interface Me {
  readonly principal: Principal;
  readonly serviceAdmin: boolean;
  readonly securityOperator: boolean;
  readonly servicePermissions?: readonly Permission[];
  readonly teams: readonly MeTeam[];
}

/**
 * Whether the caller may perform `permission`, for shaping the UI only.
 * With a team: service admins may; others need the permission in that team's `permissions[]`.
 * Without a team: `servicePermissions` when present, else service admin → all and security operator → its column.
 */
export function can(me: Me, permission: Permission, teamId?: string): boolean {
  if (teamId !== undefined) {
    if (me.serviceAdmin) return true;
    return me.teams.find((t) => t.teamId === teamId)?.permissions.includes(permission) ?? false;
  }
  if (me.servicePermissions) return me.servicePermissions.includes(permission);
  if (me.serviceAdmin) return true;
  if (me.securityOperator) return securityOperatorGrants(permission);
  return false;
}

/** The team entry of `me` for `teamId`, if the caller is bound to it. */
export function teamOf(me: Me, teamId: string): MeTeam | undefined {
  return me.teams.find((t) => t.teamId === teamId);
}

/** A caller with no team and neither service role has no access yet (CD-10). */
export function hasNoAccess(me: Me): boolean {
  return !me.serviceAdmin && !me.securityOperator && me.teams.length === 0;
}

export type ActiveRole =
  | "service_admin"
  | "security_operator"
  | "team_admin"
  | "team_viewer"
  | "workload"
  | "none";

/** The role to show in the header: service roles first, then the role in `teamId` (or the first team). */
export function activeRole(me: Me, teamId?: string): ActiveRole {
  if (me.serviceAdmin) return "service_admin";
  if (me.securityOperator) return "security_operator";
  const t = teamId ? teamOf(me, teamId) : me.teams[0];
  return t?.role ?? "none";
}
