// Governed MCP servers (API contract §4.14, v1.6.0): the enterprise catalog, its inventory, held changes, policy,
// credentials and reviews; a team's switches, its own servers, OAuth connect and federation; an agent's effective
// MCP; the MCP usage report; federated identities. No record has a credential value member: values pass from the
// input field straight into `putCredential` and are never returned.

export interface McpCheckRecord {
  readonly name: string;
  readonly outcome: string;
  readonly detail?: string | null | undefined;
  readonly checkedAt: string;
}

export interface McpFederationRecord {
  readonly audience: string;
  readonly issuer: string;
  readonly tokenEndpoint: string;
  readonly subjectTemplate?: string | undefined;
}

export interface McpServerRecord {
  readonly id: string;
  readonly slug: string;
  readonly displayName: string;
  /** `enterprise` or `team`. */
  readonly scope: string;
  readonly teamId: string | null;
  readonly owner?: string | undefined;
  readonly purpose?: string | undefined;
  readonly docUrl?: string | null | undefined;
  readonly dataClassification: string;
  readonly transport: string;
  readonly location: string;
  readonly url?: string | null | undefined;
  readonly hosted?: { readonly imageDigest: string } | null | undefined;
  readonly authKind: string;
  readonly authHeader?: string | null | undefined;
  readonly credentialMode?: string | undefined;
  /** `set`, `missing`, `expired` or `not_required`: metadata only. */
  readonly credentialState: string;
  readonly reviewStatus: string;
  readonly published: boolean;
  readonly riskTier?: string | null | undefined;
  readonly riskReasons?: readonly string[] | undefined;
  /** Who decides the pending review under `mcp.team_server_approval`: `team_admin` or `security`. */
  readonly approver?: string | null | undefined;
  readonly checks?: readonly McpCheckRecord[] | undefined;
  readonly driftPolicy: string;
  readonly trustAnnotations?: boolean | undefined;
  readonly allowSampling?: boolean | undefined;
  readonly defaultForNewTeams?: boolean | undefined;
  readonly federation?: McpFederationRecord | null | undefined;
  readonly protocolVersion?: string | null | undefined;
  readonly suspendedReason?: string | null | undefined;
  readonly adoption?: { readonly teams: number; readonly agents: number } | undefined;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface McpDecisionRecord {
  readonly allowed: boolean;
  readonly level: string | null;
  readonly reason: string | null;
}

export interface McpPrimitiveRecord {
  readonly id: string;
  readonly serverId: string;
  readonly name: string;
  readonly kind: string;
  readonly title?: string | null | undefined;
  /** `approved`, `pending_review` or `blocked`. */
  readonly status: string;
  /** `new`, `compatible` or `incompatible` while held. */
  readonly change?: string | null | undefined;
  readonly annotations?: Readonly<Record<string, unknown>> | undefined;
  readonly digest: string;
  readonly approvedDigest: string | null;
  readonly decision?: McpDecisionRecord | undefined;
}

export interface McpChangeRecord {
  readonly primitive: McpPrimitiveRecord;
  readonly approvedDefinition: Readonly<Record<string, unknown>> | null;
  readonly pendingDefinition: Readonly<Record<string, unknown>>;
  readonly diff: readonly {
    readonly field: string;
    readonly before?: unknown;
    readonly after?: unknown;
  }[];
  readonly checks: readonly McpCheckRecord[];
  readonly crossesRiskLine: boolean;
}

export interface McpReviewRecord {
  /** `server` or `primitive`. */
  readonly kind: string;
  readonly serverId: string;
  readonly slug: string;
  readonly teamId: string | null;
  readonly primitiveId?: string | null | undefined;
  readonly name?: string | null | undefined;
  readonly riskTier?: string | null | undefined;
  readonly riskReasons?: readonly string[] | undefined;
  readonly approver: string;
  readonly since: string;
}

export interface McpCredentialRecord {
  /** `_shared` or the team id. */
  readonly scope: string;
  readonly state: string;
  readonly kind?: string | undefined;
  readonly scopes: readonly string[];
  readonly subject?: string | null | undefined;
  readonly rotatedAt?: string | null | undefined;
  readonly expiresAt?: string | null | undefined;
}

export interface McpPolicyRuleRecord {
  readonly effect: string;
  readonly name?: string | undefined;
  readonly class?: string | undefined;
  readonly rateLimitPerMinute?: number | null | undefined;
}

export interface McpPolicyRecord {
  readonly serverId: string;
  readonly teamId: string | null;
  readonly level: string;
  readonly rules: readonly McpPolicyRuleRecord[];
  readonly version: number;
}

export interface TeamMcpServerRecord {
  readonly server: McpServerRecord;
  readonly enabled: boolean;
  /** `full` or `read_only`. */
  readonly mode: string;
  /** `on`, `off` or `pending`. */
  readonly state: string;
  /** `enterprise` or `team`. */
  readonly managed: string;
  readonly credential?: McpCredentialRecord | null | undefined;
  readonly federationState?: string | null | undefined;
  readonly updatedAt?: string | null | undefined;
}

export interface EffectivePrimitiveRecord {
  readonly name: string;
  readonly kind: string;
  readonly allowed: boolean;
  readonly level: string | null;
  readonly reason: string | null;
  readonly rateLimitPerMinute?: number | null | undefined;
}

export interface EffectiveServerRecord {
  readonly serverId: string;
  readonly slug: string;
  readonly scope: string;
  readonly mode: string;
  readonly url: string;
  readonly primitives: readonly EffectivePrimitiveRecord[];
}

export interface EffectiveMcpRecord {
  readonly access: string;
  readonly mode: string;
  readonly env: readonly string[];
  readonly servers: readonly EffectiveServerRecord[];
}

export interface McpUsageRowRecord {
  readonly key: string;
  readonly label: string;
  readonly calls: number;
  readonly errors: number;
  readonly refusals: number;
  readonly p50Ms?: number | null | undefined;
  readonly p95Ms?: number | null | undefined;
  readonly lastUsedAt?: string | null | undefined;
  readonly searches?: number | null | undefined;
  readonly searchHitRate?: number | null | undefined;
  readonly teams?: number | null | undefined;
  readonly agents?: number | null | undefined;
}

export interface McpUsageData {
  readonly from: string;
  readonly to: string;
  readonly view: string;
  readonly groupBy: string;
  readonly windowDays?: number | null | undefined;
  readonly rows: readonly McpUsageRowRecord[];
}

export interface McpUsageQuery {
  readonly view: string;
  readonly groupBy: string;
  readonly windowDays?: number | undefined;
}

export type McpScopeRef =
  | { readonly level: "service" }
  | { readonly level: "team"; readonly teamId: string };

export interface QueryCaptureRecord {
  readonly id: string;
  readonly reason: string;
  readonly startedAt: string;
  readonly startedBy: string;
  readonly until: string;
  readonly stoppedAt: string | null;
}

export interface FederatedIdentityRecord {
  readonly name: string;
  readonly audience: string;
  readonly envVar: string;
  readonly filePath: string;
  readonly expirationSeconds: number;
  readonly issuer: string;
  readonly subject: string;
  readonly version: number;
}

export interface Ref {
  readonly id: string;
  readonly version: number;
}

/** A review decision: the note is required by the API; per-primitive decisions are optional. */
export interface ReviewInput {
  readonly note: string;
  readonly primitives?: readonly { readonly primitiveId: string; readonly decision: string }[];
}

/** A credential sent once: a static value, or an OAuth client id and secret. */
export type CredentialInput =
  | { readonly value: string }
  | { readonly clientId: string; readonly clientSecret: string };

export interface McpServerFilter {
  readonly scope?: string | undefined;
  readonly reviewStatus?: string | undefined;
}

/** The enterprise catalog and its reviews (`mcp-servers:*`, `mcp-settings:write`, `mcp-events:read`). */
export interface McpCatalogPort {
  list(filter: McpServerFilter, signal?: AbortSignal): Promise<readonly McpServerRecord[]>;
  get(id: string, signal?: AbortSignal): Promise<McpServerRecord>;
  create(body: Readonly<Record<string, unknown>>): Promise<McpServerRecord>;
  importManifest(
    manifest: Readonly<Record<string, unknown>>,
    slug?: string,
  ): Promise<McpServerRecord>;
  update(ref: Ref, body: Readonly<Record<string, unknown>>): Promise<McpServerRecord>;
  delete(ref: Ref): Promise<void>;
  publish(id: string, note?: string): Promise<McpServerRecord>;
  retire(id: string, note?: string): Promise<McpServerRecord>;
  suspend(id: string, reason: string): Promise<McpServerRecord>;
  resume(id: string, reason: string): Promise<McpServerRecord>;
  refresh(id: string): Promise<McpServerRecord>;
  primitives(id: string, signal?: AbortSignal): Promise<readonly McpPrimitiveRecord[]>;
  change(id: string, primitiveId: string, signal?: AbortSignal): Promise<McpChangeRecord>;
  decidePrimitive(
    id: string,
    primitiveId: string,
    decision: "approve" | "reject",
    note?: string,
  ): Promise<McpPrimitiveRecord>;
  review(
    id: string,
    decision: "approve" | "reject" | "request-changes",
    input: ReviewInput,
  ): Promise<McpServerRecord>;
  putPolicy(id: string, rules: readonly McpPolicyRuleRecord[]): Promise<McpPolicyRecord>;
  /** Write-only: the value is sent once and never kept or returned. */
  putCredential(
    id: string,
    scope: string,
    credential: CredentialInput,
  ): Promise<McpCredentialRecord>;
  reviews(signal?: AbortSignal): Promise<readonly McpReviewRecord[]>;
  queryCapture(signal?: AbortSignal): Promise<QueryCaptureRecord | null>;
  startCapture(days: number, reason: string): Promise<QueryCaptureRecord>;
  stopCapture(): Promise<QueryCaptureRecord>;
}

/** A team's MCP servers (`team-mcp-servers:*`) and an agent's effective MCP. */
export interface TeamMcpPort {
  list(teamId: string, signal?: AbortSignal): Promise<readonly TeamMcpServerRecord[]>;
  get(teamId: string, id: string, signal?: AbortSignal): Promise<TeamMcpServerRecord>;
  put(teamId: string, id: string, enabled: boolean, mode?: string): Promise<TeamMcpServerRecord>;
  create(teamId: string, body: Readonly<Record<string, unknown>>): Promise<McpServerRecord>;
  delete(teamId: string, ref: Ref): Promise<void>;
  submit(teamId: string, id: string): Promise<McpServerRecord>;
  review(
    teamId: string,
    id: string,
    decision: "approve" | "reject",
    input: ReviewInput,
  ): Promise<McpServerRecord>;
  refresh(teamId: string, id: string): Promise<McpServerRecord>;
  primitives(
    teamId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<readonly McpPrimitiveRecord[]>;
  decidePrimitive(
    teamId: string,
    id: string,
    primitiveId: string,
    decision: "approve" | "reject",
    note?: string,
  ): Promise<McpPrimitiveRecord>;
  putPolicy(
    teamId: string,
    id: string,
    rules: readonly McpPolicyRuleRecord[],
  ): Promise<McpPolicyRecord>;
  /** Write-only: the value is sent once and never kept or returned. */
  putCredential(
    teamId: string,
    id: string,
    credential: CredentialInput,
  ): Promise<McpCredentialRecord>;
  startOAuth(
    teamId: string,
    id: string,
  ): Promise<{ readonly authorizationUrl: string; readonly expiresAt: string }>;
  disconnectOAuth(teamId: string, id: string): Promise<McpCredentialRecord>;
  testFederation(teamId: string, id: string): Promise<TeamMcpServerRecord>;
  effective(teamId: string, agentId: string, signal?: AbortSignal): Promise<EffectiveMcpRecord>;
}

/** `GetMcpUsageReport` and `GetTeamMcpUsageReport` (`mcp-events:read`). */
export interface McpUsagePort {
  run(scope: McpScopeRef, q: McpUsageQuery, signal?: AbortSignal): Promise<McpUsageData>;
  csv(scope: McpScopeRef, q: McpUsageQuery, signal?: AbortSignal): Promise<string>;
}

/** An agent's federated identities (PRD Appendix C; `agents:read`, `agent-federated-identities:write`). */
export interface FederatedIdentitiesPort {
  list(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly FederatedIdentityRecord[]>;
  put(
    teamId: string,
    agentId: string,
    name: string,
    body: { readonly audience: string; readonly expirationSeconds?: number | undefined },
  ): Promise<FederatedIdentityRecord>;
  delete(
    teamId: string,
    agentId: string,
    ref: { readonly name: string; readonly version: number },
  ): Promise<void>;
}
