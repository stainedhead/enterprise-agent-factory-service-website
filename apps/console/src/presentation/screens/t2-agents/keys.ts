import { queryKey } from "../../query/keys.js";

/** The polled list of a team's agents; the table, the panel and their mutations share it. */
export const agentsKey = (teamId: string) => queryKey({ area: "agents", teamId, resource: "list" });
