// Model endpoints, routes and providers (API contract §4.13, v1.5.0): the service catalog and its prices,
// proposals, credentials and federation; provider switches; team gateway settings; a team's routes and own
// endpoints; the inference report. No record has a credential value member: values pass from the input field
// straight into `putCredential` and are never returned.

export interface EndpointPriceRecord {
  readonly inputUsdPerMtok: string;
  readonly outputUsdPerMtok: string;
  readonly cachedInputUsdPerMtok?: string | undefined;
  readonly requestFeeUsd?: string | undefined;
}

export interface EndpointModelRecord {
  readonly modelName: string;
  readonly maxOutputTokens: number;
  readonly contextTokens?: number | null | undefined;
  readonly enabled: boolean;
  readonly callable?: boolean | undefined;
  /** `approved`, `pending`, `none` or `not_required`. */
  readonly priceState?: string | undefined;
  readonly price?: EndpointPriceRecord | null | undefined;
}

export interface HealthRecord {
  readonly state: string;
  readonly reason?: string | null | undefined;
  readonly since?: string | null | undefined;
}

export interface EndpointRecord {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly description?: string | undefined;
  readonly teamId: string | null;
  readonly provider: string;
  readonly providerState: string;
  readonly location: string;
  readonly baseUrl: string;
  readonly protocols: readonly string[];
  readonly authKind: string;
  readonly credentialMode: string;
  readonly pricingMode: string;
  readonly requiresTerms: boolean;
  readonly enabled: boolean;
  readonly builtin?: boolean | undefined;
  readonly metered?: boolean | undefined;
  readonly capped?: boolean | undefined;
  readonly owner?: string | null | undefined;
  readonly purpose?: string | null | undefined;
  readonly teamsSelected?: number | undefined;
  readonly health?: HealthRecord | undefined;
  readonly models?: readonly EndpointModelRecord[] | undefined;
  readonly version: number;
}

export interface EndpointTeamRecord {
  readonly teamId: string;
  readonly teamSlug?: string | undefined;
  readonly teamDisplayName?: string | undefined;
  readonly selected: boolean;
  readonly selectedBy?: string | null | undefined;
  readonly credentialState: string;
  readonly credentialRotatedAt?: string | null | undefined;
  readonly federationState: string;
  readonly gatewayDeployment: string;
  readonly gatewayVersion?: string | null | undefined;
  readonly spendMtdUsd: string;
  readonly health?: HealthRecord | undefined;
}

export interface EndpointProposalRecord {
  readonly id: string;
  readonly endpointId: string;
  readonly slug?: string | undefined;
  readonly modelName: string;
  readonly effectiveFrom: string;
  readonly fetchedAt: string;
  readonly inputUsdPerMtok: string;
  readonly outputUsdPerMtok: string;
  readonly source?: string | undefined;
  readonly status: string;
  readonly note?: string | null | undefined;
}

export interface CredentialRecord {
  readonly state: string;
  readonly rotatedAt: string | null;
}

export interface FederationRecord {
  readonly status: string;
  readonly lastError?: string | null | undefined;
  readonly expectedIssuer?: string | null | undefined;
  readonly expectedSubject?: string | null | undefined;
  readonly expectedAudience?: string | null | undefined;
  readonly expectedRoleArn?: string | null | undefined;
}

export interface ProviderImpactRecord {
  readonly routes: number;
  readonly teams: number;
  readonly agents: number;
  readonly agentsDegraded: number;
  readonly agentsMovingToFallback: number;
  readonly directSystems: number;
  readonly teamsToSelect: number;
}

export interface ProviderRecord {
  readonly provider: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly hosts: readonly string[];
  readonly teamSelection: string;
  readonly routes: number;
  readonly teams: number;
  readonly directSystems: number;
  readonly disabledReason?: string | null | undefined;
  readonly fallbackModel?: string | null | undefined;
  readonly changedAt?: string | null | undefined;
  readonly changedBy?: string | null | undefined;
  readonly impact?: ProviderImpactRecord | undefined;
  readonly version: number;
}

export interface ProviderChange {
  readonly enabled: boolean;
  readonly reason?: string | undefined;
  readonly fallbackModel?: string | undefined;
  readonly selectForAllTeams?: boolean | undefined;
}

/** `PutTeamGatewaySettings`: members sent replace stored ones; the MCP members are v1.6.0. */
export interface GatewaySettingsInput {
  readonly deployment: string;
  readonly mayAddModelEndpoints: boolean;
  readonly mayAddMcpServers?: boolean | undefined;
  readonly mcpPlacement?: string | undefined;
}

export interface GatewaySettingsRecord {
  readonly teamId: string;
  readonly deployment: string;
  readonly mayAddModelEndpoints: boolean;
  /** v1.6.0: team-admins may register team MCP servers. */
  readonly mayAddMcpServers?: boolean | undefined;
  /** v1.6.0: MCP with the model routes (`combined`) or in its own gateway Deployment (`separate`). */
  readonly mcpPlacement?: string | undefined;
  readonly gatewayState: string;
  readonly gatewayUrl?: string | null | undefined;
  readonly version: number;
}

export interface TeamEndpointRecord {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  readonly teamId: string | null;
  /** `selected`, `own` or `available`. */
  readonly relation: string;
  /** `team_admin` or `service_admin`. */
  readonly selectableBy: string;
  readonly selectedBy?: string | null | undefined;
  readonly provider: string;
  readonly providerState: string;
  readonly location: string;
  readonly baseUrl?: string | null | undefined;
  readonly baseUrlEnv?: string | undefined;
  readonly pricingMode: string;
  readonly protocols: readonly string[];
  readonly requiresTerms?: boolean | undefined;
  readonly metered?: boolean | undefined;
  readonly capped?: boolean | undefined;
  readonly credentialMode?: string | undefined;
  readonly credentialState: string;
  readonly federationState?: string | undefined;
  readonly enabled: boolean;
  readonly offReason: string | null;
  readonly owner?: string | null | undefined;
  readonly purpose?: string | null | undefined;
  readonly health?: HealthRecord | undefined;
  readonly models: readonly EndpointModelRecord[];
  readonly version: number;
}

export interface TeamEndpointsRecord {
  readonly gatewayDeployment: string;
  readonly mayAddModelEndpoints: boolean;
  readonly items: readonly TeamEndpointRecord[];
}

/** A row of the inference report; the measures the API sends (PRD §10.5). */
export interface InferenceRowRecord {
  readonly route?: string | undefined;
  readonly model?: string | undefined;
  readonly agentId?: string | undefined;
  readonly teamId?: string | undefined;
  readonly hour?: string | undefined;
  readonly day?: string | undefined;
  readonly pricingMode?: string | undefined;
  readonly calls: number;
  readonly errors: number;
  readonly refused?: number | undefined;
  readonly throttled?: number | undefined;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: string;
  readonly effectiveUsdPerMtok?: string | null | undefined;
  readonly errorRatePct?: number | undefined;
  readonly estimatedPct?: number | undefined;
  readonly latencyP50Ms?: number | null | undefined;
  readonly latencyP95Ms?: number | null | undefined;
  readonly ttftP95Ms?: number | null | undefined;
  readonly outputTokensPerSecond?: number | null | undefined;
  readonly gatewayP99Ms?: number | null | undefined;
}

export interface InferenceReportData {
  readonly range: { readonly from: string; readonly to: string };
  readonly groupBy: readonly string[];
  readonly rows: readonly InferenceRowRecord[];
  readonly totals: InferenceRowRecord;
  readonly notes: readonly string[];
}

export interface InferenceQuery {
  readonly range?: string | undefined;
  readonly groupBy?: readonly string[] | undefined;
  readonly route?: string | undefined;
  readonly agentId?: string | undefined;
  readonly teamId?: string | undefined;
}

export type InferenceScope =
  | { readonly level: "service" }
  | { readonly level: "team"; readonly teamId: string };

export interface Ref {
  readonly id: string;
  readonly version: number;
}

/** A model of a create form, with its per-token prices when there are any. */
export interface ModelInput {
  readonly modelName: string;
  readonly maxOutputTokens: number;
}

export interface PriceInput {
  readonly modelName: string;
  readonly inputUsdPerMtok: string;
  readonly outputUsdPerMtok: string;
  readonly effectiveFrom: string;
}

/** Service model endpoints (`admin:model-endpoints`; prices and proposals `admin:pricing`). */
export interface AdminModelEndpointsPort {
  list(includeTeams: boolean, signal?: AbortSignal): Promise<readonly EndpointRecord[]>;
  get(endpointId: string, signal?: AbortSignal): Promise<EndpointRecord>;
  create(body: Readonly<Record<string, unknown>>): Promise<EndpointRecord>;
  setEnabled(ref: Ref, enabled: boolean): Promise<EndpointRecord>;
  delete(ref: Ref): Promise<void>;
  createPrice(endpointId: string, price: PriceInput): Promise<void>;
  teams(endpointId: string, signal?: AbortSignal): Promise<readonly EndpointTeamRecord[]>;
  /** Write-only: the value is sent once and never kept or returned. */
  putCredential(endpointId: string, scope: string, value: string): Promise<CredentialRecord>;
  rotateCredential(endpointId: string, scope: string, value: string): Promise<CredentialRecord>;
  putFederation(
    endpointId: string,
    teamId: string,
    fields: Readonly<Record<string, string>>,
  ): Promise<FederationRecord>;
  proposals(status: string, signal?: AbortSignal): Promise<readonly EndpointProposalRecord[]>;
  approve(id: string, note?: string): Promise<EndpointProposalRecord>;
  reject(id: string, note?: string): Promise<EndpointProposalRecord>;
  putGatewaySettings(
    teamId: string,
    teamVersion: number | undefined,
    v: GatewaySettingsInput,
  ): Promise<GatewaySettingsRecord>;
}

/** Provider switches (`admin:model-endpoints` to read, `admin:inference-providers` to change). */
export interface InferenceProvidersPort {
  list(signal?: AbortSignal): Promise<readonly ProviderRecord[]>;
  /** `dryRun=true`: what the change would do, nothing written. */
  impact(
    ref: { provider: string; version: number },
    change: ProviderChange,
  ): Promise<ProviderRecord>;
  update(
    ref: { provider: string; version: number },
    change: ProviderChange,
  ): Promise<ProviderRecord>;
}

/** A team's routes (`model-endpoints:read` / `model-endpoints:write`). */
export interface TeamModelEndpointsPort {
  list(teamId: string, signal?: AbortSignal): Promise<TeamEndpointsRecord>;
  putSelections(teamId: string, endpointIds: readonly string[]): Promise<readonly string[]>;
  create(teamId: string, body: Readonly<Record<string, unknown>>): Promise<TeamEndpointRecord>;
  delete(teamId: string, ref: Ref): Promise<void>;
  putCredential(teamId: string, endpointId: string, value: string): Promise<CredentialRecord>;
}

/** `GetInferenceReport` (`admin:reports`) and `GetTeamInferenceReport` (`reports:read`). */
export interface InferenceReportsPort {
  run(scope: InferenceScope, q: InferenceQuery, signal?: AbortSignal): Promise<InferenceReportData>;
  csv(scope: InferenceScope, q: InferenceQuery, signal?: AbortSignal): Promise<string>;
}
