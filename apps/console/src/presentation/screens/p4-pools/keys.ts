import { queryKey } from "../../query/keys.js";

/** Query keys of P4; invalidating `poolsKey(teamId)` refreshes everything on the page. */
export const poolsKey = (teamId: string, resource?: string) =>
  resource === undefined
    ? queryKey({ area: "pools", teamId, resource: "" }).slice(0, 2)
    : queryKey({ area: "pools", teamId, resource });
