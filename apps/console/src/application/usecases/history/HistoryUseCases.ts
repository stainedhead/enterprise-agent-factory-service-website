import { AppError } from "../../errors.js";
import type {
  AuditFilter,
  AuditPage,
  AuditPort,
  RevisionFilter,
  RevisionRecord,
  RevisionsPage,
  RevisionsPort,
} from "../../ports/history.js";

/** A diff of two revisions of one resource: older on the left, newer on the right. */
export interface RevisionDiff {
  readonly older: RevisionRecord;
  readonly newer: RevisionRecord;
  readonly before: string;
  readonly after: string;
}

/** JSON with keys in order at every level, so equal snapshots give equal text and a diff shows only real changes. */
export function snapshotText(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([k, x]) => [k, sort(x)]),
          )
        : v;
  return JSON.stringify(sort(value ?? {}), null, 2);
}

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** The filter without blank fields (what goes in the query). */
export function cleanFilter(f: AuditFilter): AuditFilter {
  return Object.fromEntries(
    Object.entries(f).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
  ) as AuditFilter;
}

/** Team history (M1-H1, M1-H2): the audit list with its CSV, and revisions with a diff. */
export class HistoryUseCases {
  constructor(
    private readonly audit: AuditPort,
    private readonly revisions: RevisionsPort,
  ) {}

  private check(f: AuditFilter): AppError | undefined {
    if (f.from && f.to && Date.parse(f.from) > Date.parse(f.to))
      return invalid("to", "The end must not be before the start");
    return undefined;
  }

  auditPage(
    teamId: string,
    filter: AuditFilter,
    page: { maxResults: number; nextToken?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<AuditPage> {
    const problem = this.check(filter);
    if (problem) return Promise.reject(problem);
    return this.audit.list(teamId, cleanFilter(filter), page);
  }

  /** *Download CSV*: the file name and body for the current filter. */
  async auditCsv(
    teamId: string,
    filter: AuditFilter,
    signal?: AbortSignal,
  ): Promise<{ filename: string; text: string }> {
    const problem = this.check(filter);
    if (problem) throw problem;
    const text = await this.audit.csv(teamId, cleanFilter(filter), signal);
    return { filename: `audit-${teamId}.csv`, text };
  }

  revisionsPage(
    teamId: string,
    filter: RevisionFilter,
    page: { maxResults: number; nextToken?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<RevisionsPage> {
    return this.revisions.list(teamId, filter, page);
  }

  /** *Restore* step one: the plan for restoring a revision, nothing applied. */
  restorePlan(teamId: string, revision: number) {
    return this.revisions.restore(teamId, revision, true);
  }
  /** *Restore* step two, after the plan was read and confirmed. */
  restoreApply(teamId: string, revision: number) {
    return this.revisions.restore(teamId, revision, false);
  }

  /** Reads both revisions (the list may omit snapshots) and orders them by revision number. */
  async diff(teamId: string, a: number, b: number, signal?: AbortSignal): Promise<RevisionDiff> {
    if (a === b) throw invalid("revision", "Choose two different revisions");
    const [x, y] = await Promise.all([
      this.revisions.get(teamId, a, signal),
      this.revisions.get(teamId, b, signal),
    ]);
    if (x.resourceKind !== y.resourceKind || x.resourceId !== y.resourceId)
      throw invalid("revision", "Choose two revisions of the same resource");
    const [older, newer] = x.revision <= y.revision ? [x, y] : [y, x];
    return {
      older,
      newer,
      before: snapshotText(older.snapshot),
      after: snapshotText(newer.snapshot),
    };
  }
}
