// The reports area port (M3-R): team, agent and service reports with their CSV, and the cost
// reconciliations of S8. Rows are as the API sends them (CQ-16: the OpenAPI does not type the measures).

export type ReportKind = "usage" | "costs" | "activity" | "traffic";

export type ReportScope =
  | { readonly level: "team"; readonly teamId: string }
  | { readonly level: "agent"; readonly teamId: string; readonly agentId: string }
  | { readonly level: "service" };

/** The report query, as the controls produce it. */
export interface ReportQuery {
  readonly range?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly groupBy?: readonly string[] | undefined;
  readonly teamId?: string | undefined;
  readonly agentId?: string | undefined;
  readonly modelId?: string | undefined;
  readonly systemId?: string | undefined;
  readonly poolId?: string | undefined;
}

export type ReportRowRecord = Readonly<Record<string, unknown>>;

export interface ReportData {
  readonly kind: string;
  readonly range: { readonly from: string; readonly to: string };
  readonly groupBy: readonly string[];
  readonly rows: readonly ReportRowRecord[];
  readonly totals: ReportRowRecord;
  readonly notes: readonly string[];
}

export interface ReconciliationRecord {
  readonly teamId: string;
  readonly day: string;
  readonly gatewayUsd: string;
  readonly billedUsd: string;
  readonly variancePct: string;
  readonly status: string;
  readonly reconciledAt: string;
}

export interface ReportsPort {
  run(
    scope: ReportScope,
    kind: ReportKind,
    query: ReportQuery,
    signal?: AbortSignal,
  ): Promise<ReportData>;
  /** The CSV exactly as the API returns it for the same query. */
  csv(
    scope: ReportScope,
    kind: ReportKind,
    query: ReportQuery,
    signal?: AbortSignal,
  ): Promise<string>;
  reconciliations(status: string, signal?: AbortSignal): Promise<readonly ReconciliationRecord[]>;
}
