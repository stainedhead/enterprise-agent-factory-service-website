import { useQuery } from "@tanstack/react-query";
import { teamOf } from "../../domain/me.js";
import { useOptionalService } from "../services.js";
import { useMe } from "../shell/ShellContext.js";
import { teamKey } from "./useTeamWriteGate.js";

export interface TeamKind {
  /** The team's kind once read; navigation items for ephemeral teams (pools) need it. */
  readonly kind: "persistent" | "ephemeral" | undefined;
  readonly loading: boolean;
}

/** The kind of the team in the route, read through the shared team query (no request for a team the caller is not bound to). */
export function useTeamKind(teamId: string | undefined): TeamKind {
  const me = useMe();
  const teams = useOptionalService("teams");
  const q = useQuery({
    queryKey: teamKey(teamId ?? ""),
    queryFn: ({ signal }) =>
      teams && teamId ? teams.get(teamId, signal) : Promise.reject(new Error("no teams service")),
    enabled:
      teams !== undefined &&
      teamId !== undefined &&
      (me.serviceAdmin || teamOf(me, teamId) !== undefined),
  });
  const k = q.data?.kind;
  return {
    kind: k === "ephemeral" || k === "persistent" ? k : undefined,
    loading: q.isPending && q.fetchStatus !== "idle",
  };
}
