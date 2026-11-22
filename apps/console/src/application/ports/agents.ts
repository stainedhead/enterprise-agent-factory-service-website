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

/** A worker agent's connection to the team's Paperclip (absent on the collaboration agent). */
export interface AgentCollaborationRecord {
  readonly connect: boolean;
  readonly linkState: string;
  readonly paperclipAgentId?: string | null | undefined;
  readonly lastSyncedAt?: string | null | undefined;
  readonly lastError?: string | null | undefined;
}

export type AgentRole = "worker" | "collaboration";

export interface AgentRecord {
  readonly id: string;
  /** `worker` when the API sent no role. */
  readonly role?: string | undefined;
  readonly collaboration?: AgentCollaborationRecord | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly template: string;
  readonly image: string;
  readonly modelId: string;
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
  /** Set on create, immutable (WEB-US-53). */
  readonly role?: AgentRole | undefined;
  readonly collaboration?:
    | { readonly connect?: boolean | undefined; readonly paperclipAgentId?: string | undefined }
    | undefined;
  readonly name: string;
  readonly description?: string | undefined;
  readonly template: string;
  readonly image: string;
  readonly modelId: string;
  readonly iamIdentity?: string | undefined;
  readonly resources?: ResourcesRecord | undefined;
  readonly secretBindings?: readonly SecretBindingRecord[] | undefined;
  readonly volume?: VolumeRecord | undefined;
}

export interface UpdateAgentInput {
  readonly description?: string | undefined;
  readonly template?: string | undefined;
  readonly image?: string | undefined;
  readonly modelId?: string | undefined;
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
