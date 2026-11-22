import { can, type Me } from "../../domain/me.js";
import { type Permission, requiredRoleLabel } from "../../domain/permission.js";

/**
 * The `disabledReason` for a control that needs `permission`: undefined when the caller may, otherwise
 * "Requires <role>" (WEB-3). The control is disabled, never hidden; the API still decides.
 */
export function gate(me: Me, permission: Permission, teamId?: string): string | undefined {
  return can(me, permission, teamId) ? undefined : `Requires ${requiredRoleLabel(permission)}`;
}
