import { useQuery } from "@tanstack/react-query";
import { teamOf } from "../../domain/me.js";
import type { Permission } from "../../domain/permission.js";
import { queryKey } from "../query/keys.js";
import { useOptionalService } from "../services.js";
import { useMe } from "../shell/ShellContext.js";
import { gate } from "./gate.js";

/** The query key of one team; the overview, the layout and this gate share it. */
export const teamKey = (teamId: string) => queryKey({ area: "teams", teamId, resource: "team" });

export const SUSPENDED_REASON = "Team is suspended";

export interface TeamWriteGate {
  /** The team is suspended (TEAM-9). */
  readonly suspended: boolean;
  /**
   * The `disabledReason` for a control that needs `permission` in this team: the role it needs, else
   * "Team is suspended" while suspended. *Resume* and *Delete* pass `allowWhenSuspended`.
   */
  reasonFor(permission: Permission, opts?: { allowWhenSuspended?: boolean }): string | undefined;
}

/** Disables every mutating control of a suspended team except *Resume* and *Delete* (WEB-US-24.6). */
export function useTeamWriteGate(teamId: string): TeamWriteGate {
  const me = useMe();
  const teams = useOptionalService("teams");
  const q = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) =>
      teams ? teams.get(teamId, signal) : Promise.reject(new Error("no teams service")),
    // a team the caller is not bound to is "not found": no request is made for it
    enabled: teams !== undefined && (me.serviceAdmin || teamOf(me, teamId) !== undefined),
  });
  const suspended = q.data?.state === "suspended";
  return {
    suspended,
    reasonFor: (permission, opts) =>
      gate(me, permission, teamId) ??
      (suspended && !opts?.allowWhenSuspended ? SUSPENDED_REASON : undefined),
  };
}
