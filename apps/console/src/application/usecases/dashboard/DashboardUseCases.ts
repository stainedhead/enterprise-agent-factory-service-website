import { add, compare, format, isZero, percent } from "../../../domain/money.js";
import { type Dot, statusView } from "../../../domain/status.js";
import type { ClockPort } from "../../ports/auth.js";
import type { CountRecord, DashboardPort, ReadinessRecord } from "../../ports/dashboard.js";
import type { AgentSummary, OverviewPort } from "../../ports/overview.js";
import type { TeamRecord, TeamSpend, TeamsPort } from "../../ports/teams.js";

const DAY_MS = 86_400_000;
/** Teams whose agents are read for counts and *Degraded* (CQ-10: the API has no aggregate). */
export const AGENT_SCAN_LIMIT = 50;
const PAGE = 100;
const MAX_PAGES = 10;

export type Spend = Readonly<Record<string, TeamSpend>>;

export interface TeamCounts {
  readonly total: number;
  readonly active: number;
  readonly suspended: number;
  readonly ephemeral: number;
}

export interface SpendSummary {
  readonly spentUsd: string;
  readonly budgetUsd: string;
  /** Month-to-date spend as a percentage of the summed budgets; 0 when there are none. */
  readonly percent: number;
}

export interface Spender {
  readonly teamId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly costUsd: string;
}

export interface AgentScan {
  readonly byTeam: ReadonlyMap<string, readonly AgentSummary[]>;
  /** Teams whose agents were not read because of {@link AGENT_SCAN_LIMIT}. */
  readonly skippedTeams: number;
}

export interface AttentionReason {
  readonly kind: "expiring" | "budget" | "blocked" | "degraded" | "drift";
  readonly text: string;
}

export interface AttentionItem {
  readonly teamId: string;
  readonly slug: string;
  readonly displayName: string;
  readonly reasons: readonly AttentionReason[];
}

export interface ReconcilerHealth {
  readonly word: string;
  readonly dot: Dot;
  /** Every check as `name: result`, for the detail line. */
  readonly checks: readonly { readonly name: string; readonly result: string }[];
}

/** Teams that are not gone. */
const live = (t: TeamRecord) => t.state !== "deleted" && t.state !== "deleting";

/** Service dashboard reads (M1-D1..D3). The pure summaries below turn them into widgets. */
export class DashboardUseCases {
  constructor(
    private readonly teams: TeamsPort,
    private readonly overview: OverviewPort,
    private readonly port: DashboardPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  /** Every team that is not deleted, up to {@link MAX_PAGES} pages. */
  async allTeams(signal?: AbortSignal): Promise<readonly TeamRecord[]> {
    const out: TeamRecord[] = [];
    let nextToken: string | undefined;
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await this.teams.list({
        maxResults: PAGE,
        ...(nextToken && { nextToken }),
        ...(signal && { signal }),
      });
      out.push(...page.items);
      nextToken = page.nextToken;
      if (!nextToken) break;
    }
    return out.filter(live);
  }

  spend(signal?: AbortSignal): Promise<Spend> {
    return this.teams.spendByTeam(signal);
  }

  /** Reads the agents of the first {@link AGENT_SCAN_LIMIT} active teams, a few at a time. */
  async scanAgents(teams: readonly TeamRecord[], signal?: AbortSignal): Promise<AgentScan> {
    const targets = teams.filter((t) => t.state === "active");
    const read = targets.slice(0, AGENT_SCAN_LIMIT);
    const byTeam = new Map<string, readonly AgentSummary[]>();
    for (let i = 0; i < read.length; i += 5) {
      await Promise.all(
        read.slice(i, i + 5).map(async (t) => {
          byTeam.set(t.id, await this.overview.agents(t.id, signal));
        }),
      );
    }
    return { byTeam, skippedTeams: targets.length - read.length };
  }

  readiness(signal?: AbortSignal): Promise<ReadinessRecord> {
    return this.port.readiness(signal);
  }
  varianceDays(signal?: AbortSignal): Promise<CountRecord> {
    return this.port.varianceDays(signal);
  }
  pendingProposals(signal?: AbortSignal): Promise<CountRecord> {
    return this.port.pendingProposals(signal);
  }

  /** The attention list for now (WEB-US-12.2). */
  attention(
    teams: readonly TeamRecord[],
    spend: Spend,
    scan: AgentScan | undefined,
  ): AttentionItem[] {
    return attentionFor(teams, spend, scan, this.clock.now());
  }
}

export function teamCounts(teams: readonly TeamRecord[]): TeamCounts {
  return {
    total: teams.length,
    active: teams.filter((t) => t.state === "active").length,
    suspended: teams.filter((t) => t.state === "suspended").length,
    ephemeral: teams.filter((t) => t.kind === "ephemeral").length,
  };
}

/** Month-to-date spend of the live teams against the sum of their budgets. */
export function spendSummary(teams: readonly TeamRecord[], spend: Spend): SpendSummary {
  let spent = "0.00";
  let budget = "0.00";
  for (const t of teams) {
    budget = add(budget, t.maxBudgetUsd);
    const s = spend[t.id];
    if (s) spent = add(spent, s.costUsd);
  }
  return {
    spentUsd: spent,
    budgetUsd: budget,
    percent: isZero(budget) ? 0 : percent(spent, budget),
  };
}

export function topSpenders(teams: readonly TeamRecord[], spend: Spend, n = 5): Spender[] {
  return teams
    .flatMap((t) => {
      const s = spend[t.id];
      return s
        ? [{ teamId: t.id, slug: t.slug, displayName: t.displayName, costUsd: s.costUsd }]
        : [];
    })
    .filter((s) => !isZero(s.costUsd))
    .sort((a, b) => compare(b.costUsd, a.costUsd))
    .slice(0, n);
}

/** Total agents and the count per status word across the scanned teams. */
export function agentTotals(scan: AgentScan): { total: number; degraded: number } {
  let total = 0;
  let degraded = 0;
  for (const agents of scan.byTeam.values())
    for (const a of agents) {
      total++;
      if (!a.paused && a.status.phase === "Degraded") degraded++;
    }
  return { total, degraded };
}

const driftRecent = (
  status: { conditions: readonly { type: string; status: string; lastTransitionTime: string }[] },
  now: number,
) =>
  status.conditions.some(
    (c) =>
      c.type === "DriftCorrected" &&
      c.status === "True" &&
      now - Date.parse(c.lastTransitionTime) <= DAY_MS,
  );

/**
 * Teams that need a look: expiring within 7 days, month-to-date spend at 80% of the budget or more,
 * *Budget blocked*, *Degraded* agents and drift the reconciler reverted in the last 24 hours. Each
 * reason says why; a team with several shows them all.
 */
export function attentionFor(
  teams: readonly TeamRecord[],
  spend: Spend,
  scan: AgentScan | undefined,
  now: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const t of teams) {
    if (t.state === "suspended") continue;
    const reasons: AttentionReason[] = [];
    if (t.expiresAt) {
      const left = Date.parse(t.expiresAt) - now;
      if (left <= 7 * DAY_MS)
        reasons.push({
          kind: "expiring",
          text:
            left <= 0 ? "Expired" : `Expires in ${Math.max(1, Math.ceil(left / DAY_MS))} day(s)`,
        });
    }
    const s = spend[t.id];
    if (s && !isZero(t.maxBudgetUsd)) {
      const pct = percent(s.costUsd, t.maxBudgetUsd);
      if (pct >= 80)
        reasons.push({
          kind: "budget",
          text: `${Math.floor(pct)}% of budget used (${format(s.costUsd)} of ${format(t.maxBudgetUsd)})`,
        });
    }
    if (statusView(t.status).word === "Budget blocked")
      reasons.push({ kind: "blocked", text: "Budget blocked" });
    const agents = scan?.byTeam.get(t.id) ?? [];
    const degraded = agents.filter((a) => !a.paused && a.status.phase === "Degraded");
    if (degraded.length > 0)
      reasons.push({
        kind: "degraded",
        text: `${degraded.length} degraded agent${degraded.length === 1 ? "" : "s"}: ${degraded.map((a) => a.name).join(", ")}`,
      });
    if (driftRecent(t.status, now) || agents.some((a) => driftRecent(a.status, now)))
      reasons.push({ kind: "drift", text: "Drift reverted in the last 24 hours" });
    if (reasons.length > 0)
      items.push({ teamId: t.id, slug: t.slug, displayName: t.displayName, reasons });
  }
  return items;
}

/** Reconciler health from `/readyz`: the `reconciler` check when there is one, else the overall status. */
export function reconcilerHealth(r: ReadinessRecord): ReconcilerHealth {
  const result = r.checks.reconciler ?? r.status;
  const ok = result === "ok" || result === "ready" || result === "healthy";
  return {
    word: ok ? "Healthy" : "Unhealthy",
    dot: ok ? "green" : "red",
    checks: Object.entries(r.checks).map(([name, res]) => ({ name, result: res })),
  };
}
