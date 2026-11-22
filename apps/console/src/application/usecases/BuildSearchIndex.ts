import type { Me } from "../../domain/me.js";
import type { SearchEntry } from "../../domain/search.js";
import type { SearchPort } from "../ports/me.js";

/** One source of header-search entries; streams add theirs next to `teams` (D44). */
export interface SearchSource {
  readonly type: SearchEntry["type"];
  /** When present and false for the caller, the source is not loaded (no request is sent). */
  appliesTo?(me: Me): boolean;
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

/** Work orders (D44): found by title or CVE id; a caller who may not list them gets none. */
export const workOrdersSource: SearchSource = {
  type: "work-order",
  appliesTo: (me) => me.serviceAdmin || me.securityOperator,
  async load(port, signal) {
    const items = await port.listWorkOrders(signal);
    return items.map((w) => ({
      type: "work-order" as const,
      id: w.cveId ?? w.id,
      label: w.cveId ? `${w.cveId} ${w.title}` : w.title,
      route: `/work-orders/${w.id}`,
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

  async execute(signal?: AbortSignal, me?: Me): Promise<SearchEntry[]> {
    const parts = await Promise.all(
      this.sources
        .filter((s) => !me || !s.appliesTo || s.appliesTo(me))
        .map((s) => s.load(this.port, signal).catch(() => [] as readonly SearchEntry[])),
    );
    return parts.flat();
  }
}
