// What the service dashboard reads besides teams, spend and agents (M1-D1..D3).

/** `GET /readyz`: the overall status and each named check. */
export interface ReadinessRecord {
  readonly status: string;
  readonly checks: Readonly<Record<string, string>>;
}

/** A count from the first page of a list; `more` is true when the page was full and a next page exists. */
export interface CountRecord {
  readonly count: number;
  readonly more: boolean;
}

export interface DashboardPort {
  readiness(signal?: AbortSignal): Promise<ReadinessRecord>;
  /** `ListCostReconciliations` with `status=over_threshold`: team-days over the variance threshold. */
  varianceDays(signal?: AbortSignal): Promise<CountRecord>;
  /** `ListModelPriceProposals` with `status=pending`. */
  pendingProposals(signal?: AbortSignal): Promise<CountRecord>;
}
