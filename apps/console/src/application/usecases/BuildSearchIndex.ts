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
 * Each team's orchestration agent and model access (WEB-US-44, MOD-8): found by team name, from the team list
 * the index already loads, so no extra request is sent.
 */
export const teamOrchestrationSource: SearchSource = {
  type: "orchestration",
  async load(port, signal) {
    const teams = await port.listTeams(signal);
    return teams.flatMap((t): SearchEntry[] => [
      {
        type: "orchestration",
        id: t.teamId,
        label: `${t.label} orchestration agent`,
        route: `/t/${t.teamId}/orchestration`,
      },
      {
        type: "model-access",
        id: t.teamId,
        label: `${t.label} model access`,
        route: `/t/${t.teamId}/models`,
      },
    ]);
  },
};

/** The service pages for orchestration endpoints (S12) and model access (S4); service admins only, no request. */
export const serviceOrchestrationSource: SearchSource = {
  type: "orchestration",
  appliesTo: (me) => me.serviceAdmin,
  async load() {
    return [
      {
        type: "orchestration",
        id: "orchestration-endpoints",
        label: "Orchestration endpoints",
        route: "/orchestration",
      },
      {
        type: "model-access",
        id: "service-model-access",
        label: "Service model access",
        route: "/models",
      },
    ];
  },
};

export const orchestrationSources: readonly SearchSource[] = [
  teamOrchestrationSource,
  serviceOrchestrationSource,
];

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
    // sources that read the team list share one call
    let teams: ReturnType<SearchPort["listTeams"]> | undefined;
    const port: SearchPort = {
      listTeams: (sig) => {
        teams ??= this.port.listTeams(sig);
        return teams;
      },
      listWorkOrders: (sig) => this.port.listWorkOrders(sig),
    };
    const parts = await Promise.all(
      this.sources
        .filter((s) => !me || !s.appliesTo || s.appliesTo(me))
        .map((s) => s.load(port, signal).catch(() => [] as readonly SearchEntry[])),
    );
    return parts.flat();
  }
}
