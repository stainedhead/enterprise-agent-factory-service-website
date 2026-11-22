// The teams area port (M1-T1): the shapes the console needs from `ListTeams`, `GetTeam`, `CreateTeam`,
// `UpdateTeam`, `DeleteTeam`, suspend/resume, status, models, tags and the service tags S3 asks for.

export interface ConditionRecord {
  readonly type: string;
  readonly status: string;
  readonly reason?: string;
  readonly message?: string;
  readonly lastTransitionTime: string;
}

export interface StatusRecord {
  readonly phase: string;
  readonly observedGeneration: number;
  readonly conditions: readonly ConditionRecord[];
  readonly updatedAt: string;
}

export interface QuotasRecord {
  readonly cpu?: string;
  readonly memory?: string;
  readonly pods?: number;
  readonly storage?: string;
}

/** A team as the API returns it (money stays a decimal string). */
export interface TeamRecord {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly kind: string;
  readonly state: string;
  readonly namespace: string;
  readonly generation: number;
  readonly version: number;
  readonly status: StatusRecord;
  readonly maxBudgetUsd: string;
  readonly effectiveCeilingUsd: string;
  readonly ceilingOverrideUsd?: string | null;
  readonly ceilingOverrideExpiresAt?: string | null;
  readonly costCenter?: string;
  readonly description?: string;
  readonly ownerEmail?: string;
  readonly expiresAt?: string;
  readonly identityProviderId?: string;
  readonly isolationTier: string;
  readonly viewerKubectl: boolean;
  readonly mayAddExternalSystems: boolean;
  readonly mayManageAwsAccounts: boolean;
  readonly allowedAwsAccounts: readonly string[];
  readonly teardownRule?: string;
  readonly quotas?: QuotasRecord;
}

export interface FirstAdminInput {
  readonly subjectType: "user" | "group";
  readonly email?: string;
  readonly groupName?: string;
}

export interface CreateTeamInput {
  readonly displayName: string;
  readonly slug: string;
  readonly kind: string;
  readonly maxBudgetUsd: string;
  readonly costCenter?: string;
  readonly description?: string;
  readonly ownerEmail?: string;
  readonly identityProviderId?: string;
  readonly models?: readonly string[];
  readonly tags?: readonly { key: string; value: string }[];
  readonly budget?: { amountUsd: string; thresholds?: readonly number[] };
  readonly firstAdmin: FirstAdminInput;
  readonly expiresAt?: string;
  readonly teardownRule?: string;
  readonly isolationTier?: string;
  readonly viewerKubectl?: boolean;
  readonly mayAddExternalSystems?: boolean;
  readonly mayManageAwsAccounts?: boolean;
}

/** Fields of `UpdateTeam`; guardrail fields need `teams:set-guardrails` on the server. */
export interface UpdateTeamInput {
  readonly displayName?: string;
  readonly description?: string;
  readonly ownerEmail?: string;
  readonly costCenter?: string;
  readonly identityProviderId?: string | null;
  readonly maxBudgetUsd?: string;
  readonly ceilingOverrideUsd?: string | null;
  readonly ceilingOverrideExpiresAt?: string | null;
  readonly ceilingOverrideReason?: string;
  readonly isolationTier?: string;
  readonly viewerKubectl?: boolean;
  readonly mayAddExternalSystems?: boolean;
  readonly mayManageAwsAccounts?: boolean;
  readonly quotas?: QuotasRecord;
}

/** The identity of a team plus its version, enough for `If-Match`. */
export interface TeamRef {
  readonly id: string;
  readonly version: number;
}

export interface ModelRecord {
  readonly id: string;
  readonly displayName: string;
  readonly provider: string;
  readonly enabled: boolean;
}

export interface ServiceTagRecord {
  readonly key: string;
  readonly mode: string;
  readonly allowedValues?: readonly string[] | null;
  readonly defaultValue?: string | null;
  readonly value?: string | null;
  readonly description?: string;
}

export interface TeamTagRecord {
  readonly key: string;
  readonly source: string;
  readonly value?: string;
}

export interface TeamTagsRecord {
  readonly tags: readonly TeamTagRecord[];
  readonly version?: number;
}

/** Month-to-date spend of one team (from the service usage report grouped by team). */
export interface TeamSpend {
  readonly costUsd: string;
  readonly calls?: number;
}

export interface TeamPage {
  readonly items: readonly TeamRecord[];
  readonly nextToken?: string | undefined;
}

export interface ListTeamsQuery {
  readonly state?: string;
  readonly kind?: string;
  readonly maxResults: number;
  readonly nextToken?: string;
  readonly signal?: AbortSignal;
}

export interface TeamsPort {
  list(q: ListTeamsQuery): Promise<TeamPage>;
  get(id: string, signal?: AbortSignal): Promise<TeamRecord>;
  create(input: CreateTeamInput): Promise<TeamRecord>;
  update(ref: TeamRef, patch: UpdateTeamInput): Promise<TeamRecord>;
  delete(ref: TeamRef): Promise<TeamRecord>;
  suspend(id: string): Promise<TeamRecord>;
  resume(id: string): Promise<TeamRecord>;
  status(id: string, signal?: AbortSignal): Promise<StatusRecord>;
  models(id: string, signal?: AbortSignal): Promise<readonly ModelRecord[]>;
  putModels(ref: TeamRef, modelIds: readonly string[]): Promise<readonly ModelRecord[]>;
  tags(id: string, signal?: AbortSignal): Promise<TeamTagsRecord>;
  putTags(ref: TeamRef, tags: readonly { key: string; value: string }[]): Promise<TeamTagsRecord>;
  /** The model catalog S3 offers (`ListModels`). */
  catalogModels(signal?: AbortSignal): Promise<readonly ModelRecord[]>;
  /** Service tags with their allowed values (`ListServiceTags`). */
  serviceTags(signal?: AbortSignal): Promise<readonly ServiceTagRecord[]>;
  /** Month-to-date spend per team id: one call per page, never one per row. */
  spendByTeam(signal?: AbortSignal): Promise<Readonly<Record<string, TeamSpend>>>;
}
