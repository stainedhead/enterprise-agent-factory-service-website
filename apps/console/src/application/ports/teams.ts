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
  /** Whether the team may publish its collaboration endpoints (a service guardrail, WEB-US-52). */
  readonly mayExposeCollaboration?: boolean;
  /** Highest exposure any surface of the orchestration agent may have (`off`, `private`, `public`); service admins set it. */
  readonly maxCollaborationExposure?: string;
  /** `all` (every service model, now and later) or `selected` (the team list). */
  readonly modelAccess?: string;
  /** The team's orchestration agent; `null` only before the 1.1.0 backfill reached the team. */
  readonly orchestrationAgentId?: string | null;
  readonly allowedAwsAccounts: readonly string[];
  readonly teardownRule?: string;
  /** When an ephemeral team was torn down, and why (`expired`, `cap_reached`, `work_complete`, `manual`). */
  readonly tornDownAt?: string;
  readonly teardownReason?: string;
  readonly quotas?: QuotasRecord;
}

export interface FirstAdminInput {
  readonly subjectType: "user" | "group";
  readonly email?: string;
  readonly groupName?: string;
}

/** The orchestration agent created with the team (ORC-26); every field optional, defaults from the service settings. */
export interface CreateTeamOrchestrationInput {
  readonly tool?: string | undefined;
  readonly webUiExposure?: string | undefined;
  readonly webApiExposure?: string | undefined;
  readonly registrationMode?: string | undefined;
  readonly models?: {
    readonly access: "all" | "selected";
    readonly modelIds?: readonly string[] | undefined;
    readonly defaultModelId?: string | undefined;
  };
  readonly resources?: { readonly cpu?: string | undefined; readonly memory?: string | undefined };
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
  /** The team list; meaningful with `modelAccess: selected`. */
  readonly models?: readonly string[];
  readonly modelAccess?: "all" | "selected";
  readonly maxCollaborationExposure?: string;
  readonly orchestration?: CreateTeamOrchestrationInput;
  readonly tags?: readonly { key: string; value: string }[];
  readonly budget?: { amountUsd: string; period?: "lifetime"; thresholds?: readonly number[] };
  readonly firstAdmin: FirstAdminInput;
  readonly expiresAt?: string;
  readonly teardownRule?: string;
  readonly isolationTier?: string;
  readonly viewerKubectl?: boolean;
  readonly mayAddExternalSystems?: boolean;
  readonly mayManageAwsAccounts?: boolean;
  readonly mayExposeCollaboration?: boolean;
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
  readonly mayExposeCollaboration?: boolean;
  readonly maxCollaborationExposure?: string;
  /** Glob patterns over account ids and names (`teams:set-aws-accounts`). */
  readonly allowedAwsAccounts?: readonly string[];
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
  /** Enabled at the service, priced and (for a team list) allowed (MOD-1). */
  readonly callable?: boolean | undefined;
  /** `approved`, `pending` or `none`. */
  readonly priceState?: string | undefined;
  /** Team list only: `none`, `provisioning`, `ready`, `failed` or `retiring`. */
  readonly inferenceProfileState?: string | undefined;
}

/** The team's model access (MOD-2): the mode, the stored selection and the allowed set (service and team). */
export interface TeamModelsRecord {
  readonly access: "all" | "selected";
  readonly modelIds: readonly string[];
  readonly items: readonly ModelRecord[];
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
  /** The team's allowed models (service and team): what an agent may choose from. */
  models(id: string, signal?: AbortSignal): Promise<readonly ModelRecord[]>;
  teamModels(id: string, signal?: AbortSignal): Promise<TeamModelsRecord>;
  putTeamModels(
    ref: TeamRef,
    input: { readonly access: "all" | "selected"; readonly modelIds?: readonly string[] },
  ): Promise<TeamModelsRecord>;
  tags(id: string, signal?: AbortSignal): Promise<TeamTagsRecord>;
  putTags(ref: TeamRef, tags: readonly { key: string; value: string }[]): Promise<TeamTagsRecord>;
  /** The model catalog S3 offers (`ListModels`). */
  catalogModels(signal?: AbortSignal): Promise<readonly ModelRecord[]>;
  /** Service tags with their allowed values (`ListServiceTags`). */
  serviceTags(signal?: AbortSignal): Promise<readonly ServiceTagRecord[]>;
  /** `GetTeamKubeconfig`: the read-only kubeconfig YAML for the team's namespace (needs `teams:get-kubeconfig`). */
  kubeconfig(teamId: string): Promise<string>;
  /** Month-to-date spend per team id: one call per page, never one per row. */
  spendByTeam(signal?: AbortSignal): Promise<Readonly<Record<string, TeamSpend>>>;
}
