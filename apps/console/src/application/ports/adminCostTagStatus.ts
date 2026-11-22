// The cost tag status port (M5-T): `ListCostTagStatus`, one entry per tag key.

export interface CostTagStatusItem {
  readonly key: string;
  readonly seenInCur: boolean;
  readonly firstSeenAt?: string | null | undefined;
  readonly lastSeenAt?: string | null | undefined;
  /** `active`, `inactive` or `unknown` as AWS Billing reports it. */
  readonly awsStatus: string;
  readonly checkedAt: string;
}

export interface AdminCostTagStatusPort {
  list(signal?: AbortSignal): Promise<readonly CostTagStatusItem[]>;
}
