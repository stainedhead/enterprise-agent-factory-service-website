import { queryKey } from "../../query/keys.js";

/** The polled collaboration resource of a team; the panels and their mutations share it. */
export const collabKey = (teamId: string) =>
  queryKey({ area: "collaboration", teamId, resource: "resource" });
export const linksKey = (teamId: string) =>
  queryKey({ area: "collaboration", teamId, resource: "links" });
export const workersKey = (teamId: string) =>
  queryKey({ area: "collaboration", teamId, resource: "workers" });
export const managedSecretsKey = (teamId: string, agentId: string) =>
  queryKey({ area: "collaboration", teamId, resource: "managed-secrets", id: agentId });
export const recentAccessKey = (teamId: string) =>
  queryKey({ area: "collaboration", teamId, resource: "recent-access" });
