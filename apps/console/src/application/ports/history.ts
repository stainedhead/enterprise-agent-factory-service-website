// The history ports (M1-H1, M1-H2): `ListAuditEvents` (with CSV), `ListRevisions`, `GetRevision`.

export interface AuditFilter {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly actorId?: string | undefined;
  readonly action?: string | undefined;
  readonly outcome?: string | undefined;
  readonly resourceKind?: string | undefined;
  readonly resourceId?: string | undefined;
}

export interface AuditEventRecord {
  readonly id: number;
  readonly occurredAt: string;
  readonly actorId: string;
  readonly actorType: string;
  readonly action: string;
  readonly outcome: string;
  readonly resourceKind?: string | null | undefined;
  readonly resourceId?: string | null | undefined;
  readonly requestId?: string | null | undefined;
}

export interface AuditPage {
  readonly items: readonly AuditEventRecord[];
  readonly nextToken?: string | undefined;
}

export interface AuditPort {
  list(
    teamId: string,
    filter: AuditFilter,
    page: { maxResults: number; nextToken?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<AuditPage>;
  /** All matching events as CSV (follows the API's page tokens, one header row). */
  csv(teamId: string, filter: AuditFilter, signal?: AbortSignal): Promise<string>;
}

export interface RevisionRecord {
  readonly revision: number;
  readonly resourceKind: string;
  readonly resourceId: string;
  readonly operation: string;
  readonly changedBy: string;
  readonly changedAt: string;
  readonly version?: number | null | undefined;
  /** The resource as it was at this revision; present on a single read. */
  readonly snapshot?: Readonly<Record<string, unknown>> | undefined;
}

export interface RevisionsPage {
  readonly items: readonly RevisionRecord[];
  readonly nextToken?: string | undefined;
}

export interface RevisionFilter {
  readonly resourceKind?: string | undefined;
  readonly resourceId?: string | undefined;
}

export interface RevisionsPort {
  list(
    teamId: string,
    filter: RevisionFilter,
    page: { maxResults: number; nextToken?: string | undefined; signal?: AbortSignal | undefined },
  ): Promise<RevisionsPage>;
  get(teamId: string, revision: number, signal?: AbortSignal): Promise<RevisionRecord>;
}
