// The identity port (M4-I): an agent's cross-account role links (`ListAgentRoleLinks` and friends) and its
// external identities (`ListAgentIdentities` and friends). A link's role ARN and external ID never change.

export interface RoleLinkRecord {
  readonly id: string;
  readonly accountId: string;
  readonly roleArn: string;
  readonly profileName: string;
  readonly maxSessionSeconds: number | undefined;
  readonly externalId: string | undefined;
  readonly status: string;
  readonly lastVerifiedAt: string | undefined;
  readonly lastError: string | undefined;
  /** IAM trust policy for the target role; present on a single read. */
  readonly trustPolicy: Readonly<Record<string, unknown>> | undefined;
  readonly version: number;
}

export interface RoleLinkInput {
  readonly roleArn: string;
  readonly profileName: string;
  readonly maxSessionSeconds?: number | undefined;
}

export interface AgentIdentityRecord {
  readonly id: string;
  readonly kind: string;
  readonly externalRef: string;
  readonly secretId: string | undefined;
  readonly status: string;
  readonly version: number;
}

export interface AgentIdentityInput {
  readonly kind: "github_app" | "external";
  readonly externalRef: string;
  readonly secretId?: string | undefined;
}

export interface IdentityPort {
  roleLinks(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly RoleLinkRecord[]>;
  /** The links of several agents, by agent id. */
  linksForAgents(
    teamId: string,
    agentIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, readonly RoleLinkRecord[]>>>;
  roleLink(
    teamId: string,
    agentId: string,
    linkId: string,
    signal?: AbortSignal,
  ): Promise<RoleLinkRecord>;
  createRoleLink(teamId: string, agentId: string, input: RoleLinkInput): Promise<RoleLinkRecord>;
  deleteRoleLink(
    teamId: string,
    agentId: string,
    ref: { id: string; version: number },
  ): Promise<void>;
  verifyRoleLink(teamId: string, agentId: string, linkId: string): Promise<RoleLinkRecord>;
  identities(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly AgentIdentityRecord[]>;
  createIdentity(
    teamId: string,
    agentId: string,
    input: AgentIdentityInput,
  ): Promise<AgentIdentityRecord>;
  deleteIdentity(
    teamId: string,
    agentId: string,
    ref: { id: string; version: number },
  ): Promise<void>;
}
