import {
  type AfsClient,
  adminReconciliations,
  createReports,
  type ReportQueryInput,
} from "@afs/sdk";
import type {
  ReconciliationRecord,
  ReportData,
  ReportKind,
  ReportQuery,
  ReportScope,
  ReportsPort,
} from "../../application/ports/reports.js";
import { toAppError } from "./errors.js";

const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

function options(q: ReportQuery, signal?: AbortSignal): ReportQueryInput {
  const o: ReportQueryInput = {};
  if (q.range) o.range = q.range;
  if (q.from) o.from = q.from;
  if (q.to) o.to = q.to;
  if (q.groupBy && q.groupBy.length > 0) o.groupBy = [...q.groupBy];
  if (q.teamId) o.teamId = q.teamId;
  if (q.agentId) o.agentId = q.agentId;
  if (q.modelId) o.modelId = q.modelId;
  if (q.systemId) o.systemId = q.systemId;
  if (q.poolId) o.poolId = q.poolId;
  if (signal) o.signal = signal;
  return o;
}

/** `reports.*` (typed) and `admin.reconciliations` mapped to {@link ReportsPort}. */
export class SdkReports implements ReportsPort {
  readonly #reports;
  constructor(private readonly client: AfsClient) {
    this.#reports = createReports(client);
  }

  #call(scope: ReportScope, kind: ReportKind, q: ReportQuery, signal?: AbortSignal) {
    const o = options(q, signal);
    switch (scope.level) {
      case "team":
        return this.#reports.team(scope.teamId, kind, o);
      case "agent":
        return this.#reports.agent(scope.teamId, scope.agentId, kind, o);
      default:
        return this.#reports.service(kind, o);
    }
  }

  run(
    scope: ReportScope,
    kind: ReportKind,
    q: ReportQuery,
    signal?: AbortSignal,
  ): Promise<ReportData> {
    return wrap(async () => {
      const r = await this.#call(scope, kind, q, signal);
      return {
        kind: r.kind,
        range: r.range,
        groupBy: r.groupBy ?? [],
        rows: r.rows ?? [],
        totals: r.totals ?? {},
        notes: r.notes ?? [],
      };
    });
  }
  csv(scope: ReportScope, kind: ReportKind, q: ReportQuery, signal?: AbortSignal): Promise<string> {
    return wrap(() => this.#call(scope, kind, q, signal).asCsv());
  }
  reconciliations(status: string, signal?: AbortSignal): Promise<readonly ReconciliationRecord[]> {
    return wrap(async () => {
      const out: ReconciliationRecord[] = [];
      for await (const r of adminReconciliations(this.client).list({
        ...(status && { status }),
        maxResults: 100,
        ...(signal && { signal }),
      }))
        out.push(r);
      return out;
    });
  }
}
