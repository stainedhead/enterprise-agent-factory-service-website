// Status vocabulary (PRD §4.2, D24): a dot plus a word, only the contract's terms.
export type Dot = "blue" | "green" | "amber" | "red" | "grey";

export interface PhaseView {
  readonly word: string;
  readonly dot: Dot;
}

const PHASES: Record<string, PhaseView> = {
  Pending: { word: "Pending", dot: "blue" },
  Reconciling: { word: "Reconciling", dot: "blue" },
  Ready: { word: "Ready", dot: "green" },
  Degraded: { word: "Degraded", dot: "amber" },
  Failed: { word: "Failed", dot: "red" },
  Deleting: { word: "Deleting", dot: "grey" },
};

/** The view of a `status.phase`; an unknown phase passes through with a grey dot (never an error). */
export function phaseView(phase: string): PhaseView {
  return PHASES[phase] ?? { word: phase, dot: "grey" };
}

export interface ConditionLike {
  readonly type: string;
  readonly status: string;
}
export interface StatusLike {
  readonly phase: string;
  readonly conditions?: readonly ConditionLike[];
}

/** A Ready resource with `BudgetExhausted=True` shows *Budget blocked* (red). */
export function statusView(status: StatusLike): PhaseView {
  const blocked = status.conditions?.some(
    (c) => c.type === "BudgetExhausted" && c.status === "True",
  );
  if (status.phase === "Ready" && blocked) return { word: "Budget blocked", dot: "red" };
  return phaseView(status.phase);
}

const TEAM_STATES: Record<string, PhaseView> = {
  active: { word: "Active", dot: "green" },
  suspended: { word: "Suspended", dot: "grey" },
  deleting: { word: "Deleting", dot: "grey" },
  deleted: { word: "Deleted", dot: "grey" },
};
export function teamStateView(state: string): PhaseView {
  return TEAM_STATES[state] ?? { word: state, dot: "grey" };
}

const POOL_STATES: Record<string, PhaseView> = {
  enabled: { word: "Enabled", dot: "green" },
  paused: { word: "Paused", dot: "grey" },
  deleting: { word: "Deleting", dot: "grey" },
  deleted: { word: "Deleted", dot: "grey" },
};
export function poolStateView(state: string): PhaseView {
  return POOL_STATES[state] ?? { word: state, dot: "grey" };
}

/** An agent that is paused shows *Paused* (grey); otherwise its status decides. */
export function agentView(agent: { paused?: boolean; status: StatusLike }): PhaseView {
  return agent.paused ? { word: "Paused", dot: "grey" } : statusView(agent.status);
}

/** "Generation N, observed M" and, while M < N, "Change not applied yet". */
export function generationNote(
  generation: number,
  observed: number,
): { text: string; pending: boolean } {
  const pending = observed < generation;
  return {
    text: `Generation ${generation}, observed ${observed}`,
    pending,
  };
}

export const CHANGE_NOT_APPLIED = "Change not applied yet";

export interface PollInput {
  readonly phases: readonly string[];
  readonly elapsedMs: number;
  readonly hidden: boolean;
  readonly retryAfterSeconds?: number;
}

const FAST_MS = 5_000;
const SLOW_MS = 30_000;
const FAST_WINDOW_MS = 120_000;

/** The next polling delay in ms, or "stop" (W-1, WEB-7). One decision for everything a page shows. */
export const PollPolicy = {
  nextDelay(input: PollInput): number | "stop" {
    if (input.hidden) return "stop";
    let delay: number | undefined;
    if (input.phases.some((p) => p === "Pending" || p === "Reconciling")) {
      delay = input.elapsedMs < FAST_WINDOW_MS ? FAST_MS : SLOW_MS;
    } else if (input.phases.includes("Degraded")) {
      delay = SLOW_MS;
    }
    if (delay === undefined) return "stop";
    return Math.max(delay, (input.retryAfterSeconds ?? 0) * 1000);
  },
};
