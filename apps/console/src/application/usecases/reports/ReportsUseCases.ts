import { AppError } from "../../errors.js";
import type { ClockPort } from "../../ports/auth.js";
import type {
  ReconciliationRecord,
  ReportData,
  ReportKind,
  ReportQuery,
  ReportScope,
  ReportsPort,
} from "../../ports/reports.js";
import {
  type ActivitySummary,
  type ChartModel,
  chartOf,
  columnsOf,
  costOf,
  num,
  summarizeActivity,
  unmeteredSystems,
} from "./reportView.js";

export interface ReportView extends ReportData {
  /** Column keys in display order; money columns are absent from traffic. */
  readonly columns: readonly string[];
  readonly chart: ChartModel | undefined;
  /** Systems the report marks unmetered. */
  readonly unmetered: readonly string[];
  readonly activity: ActivitySummary | undefined;
}

export interface AgentSummary {
  readonly costUsd: string | undefined;
  readonly calls: number | undefined;
  readonly inputTokens: number | undefined;
  readonly outputTokens: number | undefined;
  readonly activity: ActivitySummary | undefined;
  readonly state: string | undefined;
}

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

function check(q: ReportQuery): AppError | undefined {
  if (q.from && q.to && Date.parse(q.from) > Date.parse(q.to))
    return invalid("to", "The end must not be before the start");
  return undefined;
}

/** What each report scope may be asked for; traffic and activity are never costed. */
export const SERVICE_KINDS: readonly ReportKind[] = ["usage", "costs", "activity", "traffic"];

/** Reports for S8, T11 and T12 (M3-R) and the CSV download that returns the API's body unchanged. */
export class ReportsUseCases {
  constructor(
    private readonly port: ReportsPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  async run(
    scope: ReportScope,
    kind: ReportKind,
    query: ReportQuery,
    signal?: AbortSignal,
  ): Promise<ReportView> {
    const bad = check(query);
    if (bad) throw bad;
    const data = await this.port.run(scope, kind, query, signal);
    return {
      ...data,
      columns: columnsOf(data, kind),
      chart: kind === "activity" ? undefined : chartOf(data),
      unmetered: unmeteredSystems(data.rows),
      activity: kind === "activity" ? summarizeActivity(data.rows, this.clock.now()) : undefined,
    };
  }

  /** *Download CSV*: exactly what the API returns for the same query (WEB-US-37.1). */
  async csv(
    scope: ReportScope,
    kind: ReportKind,
    query: ReportQuery,
    signal?: AbortSignal,
  ): Promise<{ filename: string; text: string }> {
    const bad = check(query);
    if (bad) throw bad;
    const text = await this.port.csv(scope, kind, query, signal);
    const who =
      scope.level === "service" ? "service" : scope.level === "team" ? scope.teamId : scope.agentId;
    return { filename: `${kind}-report-${who}.csv`, text };
  }

  /** The agent's cost, calls, tokens, utilization and longest idle (T12 and the T2 *Usage* tab). */
  async agentSummary(
    teamId: string,
    agentId: string,
    query: ReportQuery,
    signal?: AbortSignal,
  ): Promise<AgentSummary> {
    const scope: ReportScope = { level: "agent", teamId, agentId };
    const [usage, activity] = await Promise.all([
      this.port.run(scope, "usage", query, signal),
      this.port.run(scope, "activity", query, signal),
    ]);
    const m = { ...(usage.rows[0] ?? {}), ...usage.totals };
    const act = summarizeActivity(
      activity.rows.length ? activity.rows : [activity.totals],
      this.clock.now(),
    );
    const first = activity.rows[0] ?? activity.totals;
    return {
      costUsd: costOf(m),
      calls: num(m, "calls"),
      inputTokens: num(m, "inputTokens"),
      outputTokens: num(m, "outputTokens"),
      activity: act,
      state: typeof first.state === "string" ? first.state : undefined,
    };
  }

  /** Team-days whose gateway and billed figures differ (S8 *Reconciliation*). */
  reconciliations(status: string, signal?: AbortSignal): Promise<readonly ReconciliationRecord[]> {
    return this.port.reconciliations(status, signal);
  }
}
