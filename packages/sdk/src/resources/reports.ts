import type { AfsClient } from "../core/client.js";
import type { CallOptions, ReportCall } from "../core/types.js";
import { reports as generatedReports } from "../generated/resources/reports.js";

/** The four report kinds of the API. */
export type ReportKind = "usage" | "costs" | "activity" | "traffic";

/** What a report is grouped by; `tag:<key>` groups by a cost allocation tag. */
export type ReportGroup =
  | "team"
  | "agent"
  | "model"
  | "system"
  | "pool"
  | "day"
  | "hour"
  | (string & {});

/** One report row: the group-by values and the measures of the report kind. */
export type ReportRow = Readonly<Record<string, unknown>>;

/** The query of a report: a range (or `from`/`to`), what to group by, and filters. */
export interface ReportQueryInput extends CallOptions {
  range?: "24h" | "7d" | "30d" | "90d" | "mtd" | (string & {});
  from?: string;
  to?: string;
  /** One or more group-by values; sent comma-separated. */
  groupBy?: ReportGroup | readonly ReportGroup[];
  teamId?: string;
  agentId?: string;
  modelId?: string;
  systemId?: string;
  poolId?: string;
  maxResults?: number;
  nextToken?: string;
}

/** A report as returned by the API: typed rows, totals and the API's notes. */
export interface ReportResult<Row extends ReportRow = ReportRow> {
  readonly kind: string;
  readonly range: { readonly from: string; readonly to: string };
  readonly groupBy: readonly string[];
  readonly rows: readonly Row[];
  readonly totals: Readonly<Record<string, unknown>>;
  /** Statements the API attaches, for example that non-Bedrock spend is not included. Always shown. */
  readonly notes: readonly string[];
  readonly nextToken?: string;
}

/** A lazy report: await it for JSON, or call `asCsv()` for the CSV body exactly as the API returns it. */
export type TypedReportCall<Row extends ReportRow = ReportRow> = ReportCall<ReportResult<Row>>;

function toOptions(q: ReportQueryInput = {}): Record<string, unknown> {
  const { groupBy, ...rest } = q;
  return {
    ...rest,
    ...(groupBy !== undefined && {
      groupBy: typeof groupBy === "string" ? groupBy : groupBy.join(","),
    }),
  };
}

/**
 * Typed report calls (`reports.team`, `reports.agent`, `reports.service`) over the generated namespace.
 * Rows and totals carry the API's measure names (`calls`, `estimatedUsd`, `billedUsd`, ...); `asCsv()`
 * returns the CSV the API sends for the same query, following its page tokens.
 */
export function createReports(core: AfsClient) {
  const g = generatedReports(core);
  return {
    /** A team report (requires `reports:read`). */
    team<Row extends ReportRow = ReportRow>(
      teamId: string,
      kind: ReportKind,
      query?: ReportQueryInput,
    ): TypedReportCall<Row> {
      return g.team(teamId, kind, toOptions(query)) as unknown as TypedReportCall<Row>;
    },
    /** An agent report (requires `reports:read`). */
    agent<Row extends ReportRow = ReportRow>(
      teamId: string,
      agentId: string,
      kind: ReportKind,
      query?: ReportQueryInput,
    ): TypedReportCall<Row> {
      return g.agent(teamId, agentId, kind, toOptions(query)) as unknown as TypedReportCall<Row>;
    },
    /** A service-wide report over all teams (requires `admin:reports`). */
    service<Row extends ReportRow = ReportRow>(
      kind: ReportKind,
      query?: ReportQueryInput,
    ): TypedReportCall<Row> {
      return g.service(kind, toOptions(query)) as unknown as TypedReportCall<Row>;
    },
  };
}
