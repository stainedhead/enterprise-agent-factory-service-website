// The service audit port (M4-A): `ListAdminAuditEvents`, its page tokens and its CSV form.
import type { AuditEventRecord, AuditFilter } from "./history.js";

/** The service audit filter is the team one plus an optional team. */
export interface AdminAuditFilter extends AuditFilter {
  readonly teamId?: string | undefined;
}

/** A service audit event: the team one with the team it belongs to and the before/after objects. */
export interface AdminAuditEventRecord extends AuditEventRecord {
  readonly teamId?: string | null | undefined;
  readonly before?: Readonly<Record<string, unknown>> | null | undefined;
  readonly after?: Readonly<Record<string, unknown>> | null | undefined;
}

export interface AdminAuditPage {
  readonly items: readonly AdminAuditEventRecord[];
  readonly nextToken?: string | undefined;
}

export interface AdminAuditPort {
  list(
    filter: AdminAuditFilter,
    page: { maxResults: number; nextToken?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<AdminAuditPage>;
  /** All matching events as CSV (`Accept: text/csv`, following the API's page tokens). */
  csv(filter: AdminAuditFilter, signal?: AbortSignal): Promise<string>;
}
