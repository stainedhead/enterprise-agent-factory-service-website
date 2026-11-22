// Work orders (P3, P6) and the team overview's read of them (M1-O3, M6-W).

export interface WorkOrderProgress {
  readonly repos: number;
  readonly prsOpen: number;
  readonly prsMerged: number;
  readonly notAffected: number;
  readonly failedOrSkipped: number;
  readonly remaining: number;
}

export interface WorkOrderRecord {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly status: string;
  readonly slaState: string;
  readonly slaDueAt: string;
  readonly teamId?: string | null;
  readonly kind?: string | undefined;
  readonly cveId?: string | null | undefined;
  readonly templateId?: string | undefined;
  readonly budgetUsd?: string | undefined;
  readonly progress?: WorkOrderProgress | undefined;
  readonly cancelReason?: string | null | undefined;
  readonly createdAt?: string | undefined;
  readonly version?: number | undefined;
}

export interface WorkOrderNotificationRecord {
  readonly kind: string;
  readonly recipient: string;
  readonly sentAt: string;
}

export interface WorkOrderRepoRecord {
  readonly host: string;
  readonly repo: string;
  readonly status: string;
  readonly owningTeamId?: string | null | undefined;
  readonly owningContact?: string | null | undefined;
  /** `explicit` or `team_config`; only the create response carries it. */
  readonly ownerSource?: string | undefined;
  readonly prUrl?: string | null | undefined;
  readonly prNumber?: number | null | undefined;
  readonly detail?: string | null | undefined;
  readonly notifications: readonly WorkOrderNotificationRecord[];
  readonly version?: number | undefined;
}

export interface WorkOrderDetail extends WorkOrderRecord {
  readonly repos: readonly WorkOrderRepoRecord[];
}

export interface WorkOrderFilters {
  readonly status?: string | undefined;
  readonly severity?: string | undefined;
  readonly slaState?: string | undefined;
  readonly teamId?: string | undefined;
}

export interface RepoInput {
  readonly host: string;
  /** `owner/repo`. */
  readonly repo: string;
  readonly owningTeamId?: string | undefined;
  readonly owningContact?: string | undefined;
}

export interface CreateWorkOrderInput {
  readonly kind: "cve_remediation" | "general";
  readonly cveId?: string | undefined;
  readonly severity: string;
  readonly title: string;
  readonly slaDueAt: string;
  readonly templateId: string;
  readonly budgetUsd?: string | undefined;
  readonly repos: readonly RepoInput[];
}

/** What the team overview reads. */
export interface TeamWorkOrdersPort {
  /** `ListTeamWorkOrders`: assigned to the team or touching its repositories. */
  listForTeam(
    teamId: string,
    q: { maxResults: number; signal?: AbortSignal },
  ): Promise<{ items: readonly WorkOrderRecord[]; nextToken?: string | undefined }>;
}

export interface WorkOrdersPort extends TeamWorkOrdersPort {
  /** `ListWorkOrders` with the server-side filters, up to `limit` rows across pages. */
  list(
    filters: WorkOrderFilters,
    limit: number,
    signal?: AbortSignal,
  ): Promise<readonly WorkOrderRecord[]>;
  create(input: CreateWorkOrderInput, idempotencyKey?: string): Promise<WorkOrderDetail>;
  get(id: string, signal?: AbortSignal): Promise<WorkOrderDetail>;
  cancel(id: string, reason: string): Promise<WorkOrderRecord>;
  update(
    ref: { id: string; version?: number | undefined },
    input: {
      title?: string;
      budgetUsd?: string;
      slaDueAt?: string;
      addRepos?: readonly RepoInput[];
    },
  ): Promise<WorkOrderRecord>;
  repos(id: string, signal?: AbortSignal): Promise<readonly WorkOrderRepoRecord[]>;
  updateRepo(
    id: string,
    repo: WorkOrderRepoRecord,
    input: { status: string; prUrl?: string; prNumber?: number; detail?: string },
  ): Promise<WorkOrderRepoRecord>;
}
