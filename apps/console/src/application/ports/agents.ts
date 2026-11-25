// The agents port (M2-A1): `ListAgents`, `GetAgent`, `CreateAgent`, `UpdateAgent`, `DeleteAgent`,
// pause/resume/restart, `GetAgentStatus`, snapshots, the template and storage-class lists, and the
// month-to-date cost per agent (`GetUsage` grouped by agent).
import type { StatusRecord } from "./teams.js";

export interface SecretBindingRecord {
  readonly secretId: string;
  readonly delivery: string;
  /** Environment variable name or file path. */
  readonly target: string;
}

export interface VolumeRecord {
  readonly sizeGiB?: number | undefined;
  readonly storageClass?: string | undefined;
  readonly onDelete?: string | undefined;
  readonly snapshotSchedule?: string | undefined;
  readonly snapshotRetain?: number | undefined;
}

export interface ResourcesRecord {
  readonly cpu?: string | undefined;
  readonly memory?: string | undefined;
}

/** A worker agent's connection to the team's collaboration tool (absent on the orchestration agent). */
export interface AgentCollaborationRecord {
  readonly connect: boolean;
  readonly linkState: string;
  readonly paperclipAgentId?: string | null | undefined;
  readonly lastSyncedAt?: string | null | undefined;
  readonly lastError?: string | null | undefined;
}

/** `collaboration` is how a 1.0.1 API read the orchestration agent; 1.1.0 sends `orchestration`. */
export type AgentRole = "worker" | "orchestration";

/** `models` of an agent or pool (MOD-3); `effectiveModelIds` is what the agent may call now. */
export interface AgentModelsRecord {
  readonly access: "all" | "selected";
  readonly modelIds: readonly string[];
  readonly defaultModelId: string;
  readonly effectiveModelIds?: readonly string[] | undefined;
  /** v1.5.0 routes: `all` follows the team's routes; `selected` narrows them to `routes`. */
  readonly routeAccess?: "all" | "selected" | undefined;
  readonly routes?: readonly string[] | undefined;
  readonly defaultRoute?: string | null | undefined;
  readonly effectiveRoutes?: readonly string[] | undefined;
  /** The `AFS_LLM_*` and `OPENAI_*` variables the agent receives (names and non-secret values). */
  readonly env?: Readonly<Record<string, string>> | undefined;
}

/** `models` as sent on create and update: the selection is omitted for `all`. */
export interface ModelsInput {
  readonly access: "all" | "selected";
  readonly modelIds?: readonly string[] | undefined;
  readonly defaultModelId: string;
  readonly routeAccess?: "all" | "selected" | undefined;
  readonly routes?: readonly string[] | undefined;
  readonly defaultRoute?: string | null | undefined;
}

/** v1.6.0 `mcp` of an agent or pool: access, selection, discovery mode and agent-level blocks. */
export interface AgentMcpRecord {
  readonly access: string;
  readonly serverIds?: readonly string[] | undefined;
  readonly mode: string;
  readonly blocks?:
    | readonly {
        readonly serverId: string;
        readonly name?: string | undefined;
        readonly class?: string | undefined;
        readonly effect: string;
      }[]
    | undefined;
  /** Ids of the servers the agent reaches now. */
  readonly effectiveServers?: readonly string[] | undefined;
  /** The `AFS_MCP_*` names the agent receives. */
  readonly env?: readonly string[] | undefined;
}

/** `mcp` as sent on update (`UpdateAgent`, with If-Match). */
export interface AgentMcpInput {
  readonly access: "all" | "selected";
  readonly serverIds?: readonly string[] | undefined;
  readonly mode: "search" | "full";
  readonly blocks: readonly {
    readonly serverId: string;
    readonly name: string;
    readonly effect: string;
  }[];
}

export interface AgentRecord {
  readonly id: string;
  /** `worker` when the API sent no role. */
  readonly role?: string | undefined;
  /** `orchestration` on the orchestration agent only (ORC-6). */
  readonly runtime?: string | undefined;
  readonly collaboration?: AgentCollaborationRecord | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  /** `null` on the orchestration agent for callers who are not service admins (ORC-6). */
  readonly template: string | null;
  readonly image: string | null;
  readonly models: AgentModelsRecord;
  readonly mcp?: AgentMcpRecord | undefined;
  readonly paused: boolean;
  readonly generation: number;
  readonly version: number;
  readonly iamIdentity: string;
  readonly iamRoleArn?: string | undefined;
  readonly resources?: ResourcesRecord | undefined;
  readonly secretBindings: readonly SecretBindingRecord[];
  readonly volume?: VolumeRecord | undefined;
  readonly status: StatusRecord;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
  readonly createdBy?: string | undefined;
}

export interface CreateAgentInput {
  readonly collaboration?:
    | { readonly connect?: boolean | undefined; readonly paperclipAgentId?: string | undefined }
    | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly template: string;
  readonly image: string;
  readonly models: ModelsInput;
  readonly iamIdentity?: string | undefined;
  readonly resources?: ResourcesRecord | undefined;
  readonly secretBindings?: readonly SecretBindingRecord[] | undefined;
  readonly volume?: VolumeRecord | undefined;
}

export interface UpdateAgentInput {
  readonly description?: string | undefined;
  readonly mcp?: AgentMcpInput | undefined;
  readonly template?: string | undefined;
  readonly image?: string | undefined;
  readonly models?: ModelsInput | undefined;
  readonly iamIdentity?: string | undefined;
  readonly resources?: ResourcesRecord | undefined;
  readonly secretBindings?: readonly SecretBindingRecord[] | undefined;
  readonly volume?: VolumeRecord | undefined;
}

export interface AgentRef {
  readonly id: string;
  readonly version: number;
}

export interface SnapshotRecord {
  readonly id: string;
  readonly agentId: string;
  readonly reason: string;
  readonly state: string;
  readonly requestedAt: string;
  readonly completedAt?: string | null | undefined;
  readonly sizeGiB?: number | undefined;
}

export interface AgentTemplateRecord {
  /** `tpl_…`; what a swarm template names as its collaboration agent. */
  readonly id?: string | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly harness: string;
  readonly capabilities?: readonly string[] | undefined;
  readonly enabled: boolean;
  readonly currentDigest: string;
  readonly allowedDigests: readonly string[];
  readonly defaultResources?: ResourcesRecord | undefined;
  readonly version?: number | undefined;
}

export interface StorageClassRecord {
  readonly name: string;
  readonly description?: string | undefined;
  readonly enabled: boolean;
  readonly volumeType: string;
  readonly version?: number | undefined;
}

/** A team log destination, read-only here (the *Logs* tab lists where logs are delivered). */
export interface LogDestinationRecord {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly enabled: boolean;
}

export interface AgentsPort {
  list(
    teamId: string,
    signal?: AbortSignal,
    opts?: { readonly role?: AgentRole },
  ): Promise<readonly AgentRecord[]>;
  get(teamId: string, agentId: string, signal?: AbortSignal): Promise<AgentRecord>;
  create(teamId: string, input: CreateAgentInput): Promise<AgentRecord>;
  update(teamId: string, ref: AgentRef, input: UpdateAgentInput): Promise<AgentRecord>;
  delete(teamId: string, ref: AgentRef): Promise<AgentRecord>;
  pause(teamId: string, agentId: string): Promise<AgentRecord>;
  resume(teamId: string, agentId: string): Promise<AgentRecord>;
  restart(teamId: string, agentId: string): Promise<AgentRecord>;
  status(teamId: string, agentId: string, signal?: AbortSignal): Promise<StatusRecord>;
  snapshots(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly SnapshotRecord[]>;
  createSnapshot(teamId: string, agentId: string, description?: string): Promise<SnapshotRecord>;
  /** Enabled and disabled templates the team may read (`ListAgentTemplates`). */
  templates(
    signal?: AbortSignal,
    opts?: { readonly capability?: string },
  ): Promise<readonly AgentTemplateRecord[]>;
  storageClasses(signal?: AbortSignal): Promise<readonly StorageClassRecord[]>;
  /** Where the team's logs are delivered; the API has no log-read operation (WD-29). */
  logDestinations(teamId: string, signal?: AbortSignal): Promise<readonly LogDestinationRecord[]>;
  /** Month-to-date cost per agent id (USD, decimal string). */
  monthCosts(teamId: string, signal?: AbortSignal): Promise<Readonly<Record<string, string>>>;
}
