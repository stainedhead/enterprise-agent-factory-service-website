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
