import { type AfsClient, adminAudit } from "@afs/sdk";
import type {
  AdminAuditEventRecord,
  AdminAuditFilter,
  AdminAuditPage,
  AdminAuditPort,
} from "../../application/ports/adminAudit.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

const query = (f: AdminAuditFilter) => ({
  ...(f.from && { from: f.from }),
  ...(f.to && { to: f.to }),
  ...(f.actorId && { actorId: f.actorId }),
  ...(f.action && { action: f.action }),
  ...(f.outcome && { outcome: f.outcome }),
  ...(f.resourceKind && { resourceKind: f.resourceKind }),
  ...(f.resourceId && { resourceId: f.resourceId }),
  ...(f.teamId && { teamId: f.teamId }),
});

/** `admin.audit.list` mapped to {@link AdminAuditPort}. */
export class SdkAdminAudit implements AdminAuditPort {
  constructor(private readonly client: AfsClient) {}

  list(
    filter: AdminAuditFilter,
    page: { maxResults: number; nextToken?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<AdminAuditPage> {
    return wrap(async () => {
      const r = await adminAudit(this.client)
        .list({
          ...query(filter),
          maxResults: page.maxResults,
          ...(page.nextToken !== undefined && { nextToken: page.nextToken }),
          ...sig(page.signal),
        })
        .first();
      return { items: r.items as AdminAuditEventRecord[], nextToken: r.nextToken };
    });
  }
  csv(filter: AdminAuditFilter, signal?: AbortSignal): Promise<string> {
    return wrap(() =>
      adminAudit(this.client)
        .list({ ...query(filter), ...sig(signal) })
        .asCsv(),
    );
  }
}
