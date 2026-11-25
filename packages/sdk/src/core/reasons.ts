/** `details.reason` values of the collaboration contract (SDK-15). Unknown reasons still arrive as plain strings. */
export const CollaborationReason = {
  /** 409: the team already has a collaboration agent. */
  AgentExists: "collaboration_agent_exists",
  /** 404 or 409: the team has no collaboration agent. */
  AgentMissing: "collaboration_agent_missing",
  /** 409: the secret is managed by AFS or Paperclip and cannot be changed by a user. */
  ManagedSecret: "managed_secret",
  /** 409 on CreateTeam: the slug's collaboration hostname is held for 30 days. */
  HostnameHeld: "hostname_held",
  /** 409: the team is suspended. */
  TeamSuspended: "team_suspended",
  /** 400: the Paperclip master key cannot be rotated. */
  MasterKeyNotRotatable: "master_key_not_rotatable",
  /** 400: the secret name is reserved for Paperclip. */
  ReservedName: "reserved_name",
  /** 400: a Paperclip agent id was sent while registration is managed. */
  ManagedRegistration: "managed_registration",
} as const;

/** `reason` values of `details.fields[]` on a `ValidationError` for the collaboration contract (SDK-15). */
export const FieldReason = {
  BaseDomainUnset: "collab_base_domain_unset",
  PublicEndpointsOff: "collab_public_endpoints_off",
  NotAllowedForTeam: "collaboration_not_allowed_for_team",
  ProviderWithoutCollabClient: "provider_without_collab_client",
  AgentNotReady: "collaboration_agent_not_ready",
} as const;

/** `details.reason` values of the orchestration contract (API contract 4.4d, 1.1.0). */
export const OrchestrationReason = {
  /** 404 or 409: a 1.0.1 team the backfill has not reached has no orchestration agent yet. */
  AgentPending: "orchestration_agent_pending",
  /** 409 on DeleteAgent: the orchestration agent is deleted only with its team. */
  AgentRequired: "orchestration_agent_required",
  /** 400: name, role, template, image, IAM identity or snapshot-off on the orchestration agent. */
  FieldFixed: "orchestration_field_fixed",
  /** 400 on CreateAgent: a role other than worker. */
  RoleReserved: "role_reserved",
  /** 400 on CreateAgent or CreatePool: the name `orchestrator`. */
  NameReserved: "name_reserved",
  /** 400: a surface above the team's limit. */
  ExposureAboveLimit: "exposure_above_limit",
  /** 400: any level other than off for a surface the tool lacks. */
  SurfaceNotSupported: "surface_not_supported_by_tool",
  /** 409: a tool change is already running. */
  ToolChangeInProgress: "tool_change_in_progress",
  /** 400: the tool is not enabled. */
  ToolNotEnabled: "tool_not_enabled",
  /** 400: the team already uses the tool. */
  ToolUnchanged: "tool_unchanged",
} as const;

/** `details.reason` values of model access (MOD-5, MOD-7). */
export const ModelReason = {
  NotEnabledForService: "model_not_enabled_for_service",
  NotEnabledForTeam: "model_not_enabled_for_team",
  NotEnabledForAgent: "model_not_enabled_for_agent",
  NotPriced: "model_not_priced",
  IdsNotAllowedForAll: "model_ids_not_allowed_for_all",
} as const;

/**
 * `details.reason` values of model endpoints, routes and provider switches (API contract 4.13, v1.5.0).
 * Unknown reasons still arrive as plain strings.
 */
export const ModelEndpointReason = {
  /** 409: the route name is used by a service or team endpoint. */
  SlugTaken: "slug_taken",
  /** 400: `bedrock` is reserved for the built-in route. */
  SlugReserved: "slug_reserved",
  /** 400: the route name is not a DNS label (`^[a-z][a-z0-9-]{1,30}$`). */
  SlugInvalid: "slug_invalid",
  /** 400: external and corporate endpoints need an `https` base URL. */
  BaseUrlNotHttps: "base_url_not_https",
  /** 400 or 403: the endpoint's provider is switched off by provider policy. */
  ProviderDisabled: "provider_disabled",
  /** 400: Bedrock cannot be turned off until the service default is a route model selected for every team. */
  NoFallbackModel: "no_fallback_model",
  /** 400: the base URL still holds a placeholder. */
  BaseUrlPlaceholder: "endpoint_base_url_placeholder",
  /** 403: an extra-terms endpoint or a service-selected provider is selected by a service admin only. */
  NeedsServiceAdmin: "needs_service_admin",
  /** 403: the team may not declare its own endpoints (`mayAddModelEndpoints` is off). */
  TeamEndpointsNotAllowed: "team_endpoints_not_allowed",
  /** 409: an endpoint is deleted only while it is switched off. */
  EndpointEnabled: "endpoint_enabled",
} as const;

/**
 * `details.reason` values of governed MCP servers (API contract 4.14 and gateway contract 13.4, v1.6.0): the
 * validation and conflict reasons of the API and the refusal reasons the gateway records in `mcp_events`.
 * Unknown reasons still arrive as plain strings.
 */
export const McpReason = {
  /** 400: the slug is not a DNS label (`^[a-z][a-z0-9-]{1,30}$`). */
  SlugInvalid: "slug_invalid",
  /** 400: `afs` is reserved for the aggregated endpoint. */
  SlugReserved: "slug_reserved",
  /** 409: an enterprise or team server already uses the slug. */
  SlugTaken: "slug_taken",
  /** 400: a remote server needs an `https` URL. */
  UrlNotHttps: "url_not_https",
  /** 400: the host is on `mcp.host_deny_list`. */
  HostDenied: "host_denied",
  /** 400: a hosted image is not pinned by digest. */
  ImageNotPinned: "image_not_pinned",
  /** 400: a hosted image is not signed. */
  ImageUnsigned: "image_unsigned",
  /** 400: a hosted image's registry is not in `mcp.allowed_image_registries`. */
  RegistryNotAllowed: "registry_not_allowed",
  /** 400: the auth kind is not supported for this transport or location. */
  AuthKindUnsupported: "auth_kind_unsupported",
  /** 400: user-delegated OAuth connects a service account, never a named person. */
  ServiceAccountRequired: "service_account_required",
  /** 400: the audience is not in `federation.allowed_audiences`. */
  AudienceNotAllowed: "audience_not_allowed",
  /** 400: `sts.amazonaws.com` and `afs-gateway` are reserved audiences. */
  AudienceReserved: "audience_reserved",
  /** 400: the query capture is longer than `mcp.query_capture_max_days`. */
  CaptureWindowTooLong: "capture_window_too_long",
  /** 409: a query capture is already running. */
  CaptureActive: "capture_active",
  /** 400: an agent selects a server the team has not switched on. */
  ServerNotEnabledForTeamOnAgent: "mcp_server_not_enabled_for_team",
  /** 400: a policy rule names neither or both of `name` and `class`. */
  InvalidPolicyRule: "invalid_policy_rule",
  /** 403: the team may not register servers (`mayAddMcpServers` is off). */
  TeamServersNotAllowed: "team_servers_not_allowed",
  /** 403: `mcp.team_server_approval` does not let this caller approve this risk tier. */
  ApprovalNotPermittedByPolicy: "approval_not_permitted_by_policy",
  /** 403: the operation is for team-registered servers only. */
  NotTeamServer: "not_team_server",
  /** 409: the server is switched on by teams or selected by agents. */
  ServerInUse: "server_in_use",
  /** 403 or 409: the server is not published. Also a gateway refusal. */
  ServerNotPublished: "server_not_published",
  /** 409: the server is not approved. */
  ServerNotApproved: "server_not_approved",
  /** 409: MCP needs the team's own gateway (`gatewayDeployment` `per_namespace`). */
  TeamGatewayRequired: "team_gateway_required",
  /** 409: the review status does not allow that step. */
  InvalidReviewTransition: "invalid_review_transition",
  /** 409: at most 10 federated identities per agent or pool. */
  FederatedIdentityLimit: "federated_identity_limit",
  /** 409: an `mcp` external system covered by an MCP server cannot be granted; use the server. */
  GovernedByMcpServer: "governed_by_mcp_server",
  /** Gateway refusal: the server is suspended. */
  ServerSuspended: "server_suspended",
  /** Gateway refusal: the team has not switched the server on. */
  ServerNotEnabledForTeam: "server_not_enabled_for_team",
  /** Gateway refusal: the agent's selection does not include the server. */
  ServerNotEnabledForAgent: "server_not_enabled_for_agent",
  /** Gateway refusal: a service rule blocks the primitive. */
  PrimitiveBlockedService: "primitive_blocked_service",
  /** Gateway refusal: a team rule blocks the primitive. */
  PrimitiveBlockedTeam: "primitive_blocked_team",
  /** Gateway refusal: an agent block covers the primitive. */
  PrimitiveBlockedAgent: "primitive_blocked_agent",
  /** Gateway refusal: the primitive is new or changed and held for review. */
  PrimitivePendingReview: "primitive_pending_review",
  /** Gateway refusal: a per-primitive or per-agent rate limit. */
  RateLimited: "rate_limited",
  /** Gateway refusal: the service account's OAuth refresh token expired or was revoked. */
  AuthReconnectNeeded: "auth_reconnect_needed",
  /** Gateway refusal: workload federation is not trusted or failing. */
  FederationNotReady: "federation_not_ready",
  /** Gateway refusal: `Mcp-Method` or `Mcp-Name` differs from the body. */
  HeaderMismatch: "header_mismatch",
} as const;

/** One of the {@link McpReason} values. */
export type McpReasonValue = (typeof McpReason)[keyof typeof McpReason];
