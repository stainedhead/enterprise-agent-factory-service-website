import type { SearchEntry } from "../../domain/search.js";
import type { SearchPort } from "../ports/me.js";

/** One source of header-search entries; streams add theirs next to `teams` (D44). */
export interface SearchSource {
  readonly type: SearchEntry["type"];
  load(port: SearchPort, signal?: AbortSignal): Promise<readonly SearchEntry[]>;
}

export const teamsSource: SearchSource = {
  type: "team",
  async load(port, signal) {
    const teams = await port.listTeams(signal);
    return teams.map((t) => ({
      type: "team" as const,
      id: t.teamId,
      label: t.label,
      route: `/t/${t.teamId}`,
    }));
  },
};

/**
 * Builds the search index from list calls only (no detail or mutating calls). A source that fails is
 * skipped so one broken list never hides the rest.
 */
export class BuildSearchIndex {
  constructor(
    private readonly port: SearchPort,
    private readonly sources: readonly SearchSource[],
  ) {}

  async execute(signal?: AbortSignal): Promise<SearchEntry[]> {
    const parts = await Promise.all(
      this.sources.map((s) => s.load(this.port, signal).catch(() => [] as readonly SearchEntry[])),
    );
    return parts.flat();
  }
}
