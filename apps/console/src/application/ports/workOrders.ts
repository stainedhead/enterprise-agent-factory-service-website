// Work orders as the team overview shows them: read-only (M1-O3). M6-W extends this port.
export interface WorkOrderRecord {
  readonly id: string;
  readonly title: string;
  readonly severity: string;
  readonly status: string;
  readonly slaState: string;
  readonly slaDueAt: string;
  readonly teamId?: string | null;
}

export interface WorkOrdersPort {
  /** `ListTeamWorkOrders`: assigned to the team or touching its repositories. */
  listForTeam(
    teamId: string,
    q: { maxResults: number; signal?: AbortSignal },
  ): Promise<{ items: readonly WorkOrderRecord[]; nextToken?: string | undefined }>;
}
