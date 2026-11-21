import type { Me } from "../../domain/me.js";

/** `GET /v1/me`: the caller's identity, roles and permissions. Throws `AppError`. */
export interface MePort {
  get(signal?: AbortSignal): Promise<Me>;
}

/** The directory the header search and the team switcher list from (list calls only). */
export interface SearchPort {
  listTeams(signal?: AbortSignal): Promise<readonly { teamId: string; label: string }[]>;
}
