import { AppError } from "../../errors.js";
import type {
  AdminAuditEventRecord,
  AdminAuditFilter,
  AdminAuditPage,
  AdminAuditPort,
} from "../../ports/adminAudit.js";

const clean = (f: AdminAuditFilter): AdminAuditFilter =>
  Object.fromEntries(
    Object.entries(f).filter(([, v]) => typeof v === "string" && v.trim() !== ""),
  ) as AdminAuditFilter;

/** What an event shows beyond its action (WEB-US-16.2). */
export type EventNote =
  | { readonly kind: "denied"; readonly permission: string | undefined }
  | { readonly kind: "drift"; readonly object: string }
  | undefined;

const text = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/**
 * Denied requests name the permission required and drift corrections name the object. The contract does not
 * say where the permission is carried (CQ-18), so it is read from `after`, then `before`.
 */
export function eventNote(e: AdminAuditEventRecord): EventNote {
  if (e.outcome === "denied")
    return {
      kind: "denied",
      permission:
        text(e.after?.requiredPermission) ??
        text(e.after?.permission) ??
        text(e.before?.requiredPermission),
    };
  if (/^drift[._ -]?corrected$/i.test(e.action))
    return {
      kind: "drift",
      object: [e.resourceKind, e.resourceId].filter(Boolean).join(" ") || "unknown object",
    };
  return undefined;
}

/** The service audit log (M4-A): filters sent as query parameters, notes, and the CSV for the same filters. */
export class AdminAuditUseCases {
  constructor(private readonly port: AdminAuditPort) {}

  private check(f: AdminAuditFilter): AppError | undefined {
    if (f.from && f.to && Date.parse(f.from) > Date.parse(f.to))
      return new AppError({
        kind: "validation",
        message: "The end must not be before the start",
        fields: { to: "The end must not be before the start" },
      });
    return undefined;
  }

  page(
    filter: AdminAuditFilter,
    page: { maxResults: number; nextToken?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<AdminAuditPage> {
    const bad = this.check(filter);
    return bad ? Promise.reject(bad) : this.port.list(clean(filter), page);
  }

  async csv(
    filter: AdminAuditFilter,
    signal?: AbortSignal,
  ): Promise<{ filename: string; text: string }> {
    const bad = this.check(filter);
    if (bad) throw bad;
    return {
      filename: filter.teamId ? `audit-${filter.teamId}.csv` : "audit-service.csv",
      text: await this.port.csv(clean(filter), signal),
    };
  }
}
