// The collaboration port (WEB-US-44..50, kept in 1.1.0): the links of worker agents to the team's collaboration
// tool, key rotation, and the managed secrets and recent access of the orchestration agent. The tool and its
// endpoints are on the orchestration port. Nothing here carries a tool key, a secret value or tool content.
import type { AccessRow } from "../../domain/collaboration.js";

export interface ConditionRecord {
  readonly type: string;
  readonly status: string;
  readonly reason?: string | undefined;
  readonly message?: string | undefined;
}

export interface LinkRecord {
  readonly agentId: string;
  readonly agentName: string;
  readonly connect: boolean;
  readonly linkState: string;
  readonly paperclipAgentId?: string | null | undefined;
  /** Buzz: the worker's public key (read-only). */
  readonly toolAgentId?: string | null | undefined;
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

export interface CollaborationPort {
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
}
