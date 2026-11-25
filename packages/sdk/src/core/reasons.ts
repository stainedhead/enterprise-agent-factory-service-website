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
