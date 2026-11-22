import { percent } from "../../../domain/money.js";
import { agentView, type Dot } from "../../../domain/status.js";
import type {
  ActivityRecord,
  AgentSummary,
  BudgetRecord,
  OverviewPort,
} from "../../ports/overview.js";
import type { TeamWorkOrdersPort, WorkOrderRecord } from "../../ports/workOrders.js";

export interface AgentHealth {
  readonly total: number;
  /** Count per status word (`Ready`, `Degraded`, `Paused`, `Budget blocked`...), in first-seen order. */
  readonly counts: readonly { readonly word: string; readonly dot: Dot; readonly count: number }[];
  /** The team's shared IAM role, read from an agent that uses it (the API has no team-level field, CQ-9). */
  readonly sharedRoleArn: string | undefined;
}

export interface BudgetBurn {
  readonly budget: BudgetRecord;
  /** Spent as a percentage of the amount, 0 to 100 or more. */
  readonly percent: number;
  readonly crossed: readonly number[];
}

/** Team overview reads (M1-O1..O3). Write operations live in `TeamsUseCases`. */
export class OverviewUseCases {
  constructor(
    private readonly port: OverviewPort,
    private readonly workOrders: TeamWorkOrdersPort,
  ) {}

  async budgetBurn(teamId: string, signal?: AbortSignal): Promise<BudgetBurn> {
    const budget = await this.port.budget(teamId, signal);
    const pct = budget.percentUsed ?? percent(budget.spentUsd, budget.amountUsd);
    return { budget, percent: pct, crossed: budget.thresholds.filter((t) => pct >= t) };
  }

  async agentHealth(teamId: string, signal?: AbortSignal): Promise<AgentHealth> {
    const agents = await this.port.agents(teamId, signal);
    return summarise(agents);
  }

  recentActivity(
    teamId: string,
    limit = 5,
    signal?: AbortSignal,
  ): Promise<readonly ActivityRecord[]> {
    return this.port.recentActivity(teamId, limit, signal);
  }

  async teamWorkOrders(teamId: string, signal?: AbortSignal): Promise<readonly WorkOrderRecord[]> {
    return (
      await this.workOrders.listForTeam(teamId, { maxResults: 10, ...(signal && { signal }) })
    ).items;
  }
}

/** Counts agents by status word; a paused agent counts as Paused whatever its phase. */
export function summarise(agents: readonly AgentSummary[]): AgentHealth {
  const counts = new Map<string, { dot: Dot; count: number }>();
  for (const a of agents) {
    const v = agentView(a);
    counts.set(v.word, { dot: v.dot, count: (counts.get(v.word)?.count ?? 0) + 1 });
  }
  return {
    total: agents.length,
    counts: [...counts].map(([word, c]) => ({ word, dot: c.dot, count: c.count })),
    sharedRoleArn: agents.find((a) => a.iamIdentity === "team_shared" && a.iamRoleArn)?.iamRoleArn,
  };
}
