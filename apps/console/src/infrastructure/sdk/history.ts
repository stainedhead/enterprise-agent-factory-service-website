import { type AfsClient, audit, revisions } from "@afs/sdk";
import type {
  AuditEventRecord,
  AuditFilter,
  AuditPage,
  AuditPort,
  RestoreChangeRecord,
  RestorePlan,
  RevisionFilter,
  RevisionRecord,
  RevisionsPage,
  RevisionsPort,
} from "../../application/ports/history.js";
import { toAppError } from "./errors.js";

type WireChange = Awaited<ReturnType<ReturnType<typeof revisions>["restore"]>>["changes"][number];
const toChange = (c: WireChange): RestoreChangeRecord => ({
  action: c.action,
  resourceKind: c.resourceKind,
  resourceId: c.resourceId,
  reason: c.reason ?? undefined,
  fields: (c.fields ?? []).map((f) => ({ field: f.field, from: f.from, to: f.to })),
});

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Page = {
  maxResults: number;
  nextToken?: string | undefined;
  signal?: AbortSignal | undefined;
};
const paging = (p: Page) => ({
  maxResults: p.maxResults,
  ...(p.nextToken !== undefined && { nextToken: p.nextToken }),
  ...sig(p.signal),
});
const auditQuery = (f: AuditFilter) => ({
  ...(f.from && { from: f.from }),
  ...(f.to && { to: f.to }),
  ...(f.actorId && { actorId: f.actorId }),
  ...(f.action && { action: f.action }),
  ...(f.outcome && { outcome: f.outcome }),
  ...(f.resourceKind && { resourceKind: f.resourceKind }),
  ...(f.resourceId && { resourceId: f.resourceId }),
});

/** `audit.list` mapped to {@link AuditPort}. */
export class SdkAudit implements AuditPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, filter: AuditFilter, page: Page): Promise<AuditPage> {
    return wrap(async () => {
      const r = await audit(this.client)
        .list(teamId, { ...auditQuery(filter), ...paging(page) })
        .first();
      return { items: r.items as AuditEventRecord[], nextToken: r.nextToken };
    });
  }
  csv(teamId: string, filter: AuditFilter, signal?: AbortSignal): Promise<string> {
    return wrap(() =>
      audit(this.client)
        .list(teamId, { ...auditQuery(filter), ...sig(signal) })
        .asCsv(),
    );
  }
}

/** `revisions.*` mapped to {@link RevisionsPort}. */
export class SdkRevisions implements RevisionsPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, filter: RevisionFilter, page: Page): Promise<RevisionsPage> {
    return wrap(async () => {
      const r = await revisions(this.client)
        .list(teamId, {
          ...(filter.resourceKind && { resourceKind: filter.resourceKind }),
          ...(filter.resourceId && { resourceId: filter.resourceId }),
          ...paging(page),
        })
        .first();
      return { items: r.items as RevisionRecord[], nextToken: r.nextToken };
    });
  }
  get(teamId: string, revision: number, signal?: AbortSignal): Promise<RevisionRecord> {
    return wrap(
      async () =>
        (await revisions(this.client).get(teamId, String(revision), sig(signal))) as RevisionRecord,
    );
  }
  restore(teamId: string, revision: number, dryRun: boolean): Promise<RestorePlan> {
    return wrap(async () => {
      const r = await revisions(this.client).restore(teamId, String(revision), { dryRun });
      return {
        revision: r.revision,
        dryRun: r.dryRun,
        changes: r.changes.map(toChange),
        skipped: (r.skipped ?? []).map(toChange),
      };
    });
  }
}
