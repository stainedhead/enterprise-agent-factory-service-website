// The collaboration port (Paperclip change, WEB-US-44..50): the team's collaboration resource, its links to
// worker agents, key rotation, the managed secrets and recent access of the collaboration agent, and the
// service-wide endpoint list. Nothing here carries a Paperclip key, a secret value or Paperclip content.
import type { AccessRow } from "../../domain/collaboration.js";

export interface ConditionRecord {
  readonly type: string;
  readonly status: string;
  readonly reason?: string | undefined;
  readonly message?: string | undefined;
}

export interface CollaborationRecord {
  readonly teamId: string;
  readonly agentId: string;
  readonly version: number;
  readonly generation: number;
  readonly hostname: string | null;
  readonly webUiEnabled: boolean;
  readonly restApiEnabled: boolean;
  readonly webUiUrl: string | null;
  readonly restApiUrl: string | null;
  readonly registrationMode: string;
  readonly effective: {
    readonly webUi: boolean;
    readonly restApi: boolean;
    readonly reasons: readonly string[];
  };
  readonly phase: string;
  readonly observedGeneration: number;
  readonly conditions: readonly ConditionRecord[];
  readonly unmanagedPaperclipAgents: readonly string[];
}

export interface PutCollaborationInput {
  readonly webUiEnabled: boolean;
  readonly restApiEnabled: boolean;
  /** Omitted keeps the current mode. */
  readonly registrationMode?: string | undefined;
}

export interface LinkRecord {
  readonly agentId: string;
  readonly agentName: string;
  readonly connect: boolean;
  readonly linkState: string;
  readonly paperclipAgentId?: string | null | undefined;
  readonly lastSyncedAt?: string | null | undefined;
  readonly lastError?: string | null | undefined;
  readonly version: number;
}

export interface LinksQuery {
  readonly linkState?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface LinksPage {
  readonly items: readonly LinkRecord[];
  readonly nextToken?: string | undefined;
}

export interface ManagedSecretRecord {
  readonly id: string;
  readonly name: string;
  readonly managedBy: string;
  readonly agentId?: string | undefined;
  readonly lastChangedAt?: string | undefined;
}

/** Up to 100 managed secrets of one kind and whether the API had more. */
export interface ManagedSecretsPage {
  readonly items: readonly ManagedSecretRecord[];
  readonly more: boolean;
}

export interface RotateResult {
  readonly rotated: readonly { readonly name: string; readonly versionId: string }[];
  readonly signsOutEveryone: boolean;
  readonly agentRolloutPending: boolean;
}

export interface AccessReport {
  readonly signIns: number;
  readonly uniquePeople: number;
  readonly deniedRequests: number;
  readonly rows: readonly AccessRow[];
}

export interface EndpointRecord {
  readonly teamId: string;
  readonly slug: string;
  readonly hostname: string | null;
  readonly webUi: boolean;
  readonly restApi: boolean;
  readonly phase: string;
  readonly teamState: string;
  readonly mayExposeCollaboration: boolean;
  readonly lastAccessAt?: string | null | undefined;
}

export interface EndpointsQuery {
  readonly teamId?: string | undefined;
  readonly state?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface EndpointsPage {
  readonly items: readonly EndpointRecord[];
  readonly nextToken?: string | undefined;
}

export interface CollaborationPort {
  /** A team without a collaboration agent answers `not-found` with reason `collaboration_agent_missing`. */
  get(teamId: string, signal?: AbortSignal): Promise<CollaborationRecord>;
  put(
    teamId: string,
    ref: { readonly version: number },
    input: PutCollaborationInput,
  ): Promise<CollaborationRecord>;
  listLinks(teamId: string, query: LinksQuery, signal?: AbortSignal): Promise<LinksPage>;
  connect(teamId: string, agentId: string, paperclipAgentId?: string): Promise<LinkRecord>;
  disconnect(teamId: string, agentId: string): Promise<LinkRecord>;
  rotateKeys(teamId: string, names: readonly string[]): Promise<RotateResult>;
  listManagedSecrets(
    teamId: string,
    managedBy: "afs" | "paperclip",
    signal?: AbortSignal,
  ): Promise<ManagedSecretsPage>;
  recentAccess(teamId: string, signal?: AbortSignal): Promise<AccessReport>;
  listEndpoints(query: EndpointsQuery, signal?: AbortSignal): Promise<EndpointsPage>;
  endpointsCsv(query: EndpointsQuery): Promise<string>;
}
