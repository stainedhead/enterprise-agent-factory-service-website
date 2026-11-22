// The budgets area port (M3-B): `GetBudget`, `PutBudget`, `ListCosts` and `GetUsage` for T5.
import type { BudgetRecord } from "./overview.js";

export type { BudgetRecord };

/** One cost line of a day: the gateway's real-time figure or a CUR figure (`source`). */
export interface CostLine {
  readonly day: string;
  readonly source: string;
  readonly costUsd: string;
  readonly agentId?: string | null | undefined;
}

export interface AgentUsage {
  readonly agentId: string;
  readonly calls: number;
  readonly inputTokens?: number | undefined;
  readonly outputTokens?: number | undefined;
  readonly costUsd: string;
}

export interface PutBudgetInput {
  readonly amountUsd: string;
  readonly period: string;
  readonly thresholds: readonly number[];
  readonly onExhaust: string;
}

export interface UsageRange {
  readonly from: string;
  readonly to: string;
}

export interface BudgetsPort {
  get(teamId: string, signal?: AbortSignal): Promise<BudgetRecord>;
  /** Saves against `version` (sent as `If-Match`). */
  put(teamId: string, version: number, input: PutBudgetInput): Promise<BudgetRecord>;
  costs(teamId: string, range: UsageRange, signal?: AbortSignal): Promise<readonly CostLine[]>;
  usageByAgent(
    teamId: string,
    range: UsageRange,
    signal?: AbortSignal,
  ): Promise<readonly AgentUsage[]>;
  /** The usage CSV exactly as the API returns it for the range. */
  usageCsv(teamId: string, range: UsageRange, signal?: AbortSignal): Promise<string>;
}
