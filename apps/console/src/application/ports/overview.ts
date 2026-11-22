import type { StatusRecord } from "./teams.js";

export interface BudgetRecord {
  readonly amountUsd: string;
  readonly spentUsd: string;
  readonly reservedUsd: string;
  readonly period: string;
  readonly onExhaust: string;
  readonly thresholds: readonly number[];
  readonly percentUsed?: number;
  readonly forecastUsd?: string;
  readonly projectedCapAt?: string | null;
  readonly version: number;
}

export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  readonly paused: boolean;
  readonly status: StatusRecord;
  readonly iamIdentity: string;
  readonly iamRoleArn?: string;
}

export interface ActivityRecord {
  readonly id: number;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly action: string;
  readonly outcome: string;
  readonly resourceKind?: string | null;
  readonly resourceId?: string | null;
  readonly requestId?: string | null;
}

/** What the team overview reads besides the team itself: budget, agents and recent audit events. */
export interface OverviewPort {
  budget(teamId: string, signal?: AbortSignal): Promise<BudgetRecord>;
  /** The first page of the team's agents, enough for health counts. */
  agents(teamId: string, signal?: AbortSignal): Promise<readonly AgentSummary[]>;
  recentActivity(
    teamId: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<readonly ActivityRecord[]>;
}
