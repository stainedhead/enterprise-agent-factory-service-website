// The pools port (M5-P1): stages and pools of an ephemeral team, with the 26 operations behind P4 —
// `ListStages`..`DeleteStage`, `ListPools`..`DeletePool`, scale/pause/resume, `GetPoolStatus`, handoffs,
// secret bindings, configuration values, external systems and role links. Pools carry no secret values.
import type { SecretBindingRecord } from "./agents.js";
import type { StatusRecord } from "./teams.js";

export interface StageRecord {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly description?: string | undefined;
  readonly version: number;
}

export interface PoolRecord {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly template: string;
  readonly image: string;
  readonly modelId: string;
  readonly persona?: string | undefined;
  readonly workers: number;
  readonly stageId: string | null;
  readonly state: string;
  readonly handoffs: readonly string[];
  readonly scratchSizeGiB: number | undefined;
  readonly sharedVolume: string;
  readonly resources?:
    | { readonly cpu?: string | undefined; readonly memory?: string | undefined }
    | undefined;
  readonly generation: number;
  readonly version: number;
  readonly status: StatusRecord;
}

/** Workers by what they report (`GetPoolStatus`). */
export interface PoolWorkers {
  readonly desired: number;
  readonly reporting: number;
  readonly working: number;
  readonly idle: number;
  readonly impaired: number;
}

export interface PoolStatusRecord {
  readonly status: StatusRecord;
  readonly workers: PoolWorkers;
}

export interface CreatePoolInput {
  readonly name: string;
  readonly description?: string | undefined;
  readonly template: string;
  readonly image: string;
  readonly modelId: string;
  readonly persona?: string | undefined;
  readonly workers: number;
  readonly stageId?: string | null | undefined;
  readonly scratchSizeGiB?: number | undefined;
  readonly sharedVolume?: "none" | "efs" | undefined;
  readonly resources?:
    | { readonly cpu?: string | undefined; readonly memory?: string | undefined }
    | undefined;
}

export type UpdatePoolInput = Partial<Omit<CreatePoolInput, "name">>;

export interface ConfigValueRow {
  readonly name: string;
  readonly source: string;
  readonly value: string | undefined;
}

export interface PoolRoleLinkRecord {
  readonly id: string;
  readonly accountId: string;
  readonly roleName: string;
  readonly profileName: string;
  readonly status: string;
  readonly lastVerifiedAt: string | undefined;
  readonly lastError: string | undefined;
  readonly version: number;
}

export interface PoolRoleLinkInput {
  readonly accountId: string;
  readonly roleName: string;
  readonly profileName: string;
  readonly maxSessionSeconds?: number | undefined;
}

export interface Ref {
  readonly id: string;
  readonly version: number;
}

export interface PoolsPort {
  listStages(teamId: string, signal?: AbortSignal): Promise<readonly StageRecord[]>;
  createStage(
    teamId: string,
    input: { name: string; position: number; description?: string },
  ): Promise<StageRecord>;
  updateStage(
    teamId: string,
    ref: Ref,
    patch: { position?: number; description?: string },
  ): Promise<StageRecord>;
  deleteStage(teamId: string, ref: Ref): Promise<void>;

  list(teamId: string, signal?: AbortSignal): Promise<readonly PoolRecord[]>;
  get(teamId: string, poolId: string, signal?: AbortSignal): Promise<PoolRecord>;
  create(teamId: string, input: CreatePoolInput): Promise<PoolRecord>;
  update(teamId: string, ref: Ref, patch: UpdatePoolInput): Promise<PoolRecord>;
  delete(teamId: string, ref: Ref): Promise<PoolRecord>;
  scale(teamId: string, poolId: string, workers: number): Promise<PoolRecord>;
  pause(teamId: string, poolId: string): Promise<PoolRecord>;
  resume(teamId: string, poolId: string): Promise<PoolRecord>;
  status(teamId: string, poolId: string, signal?: AbortSignal): Promise<PoolStatusRecord>;

  handoffs(
    teamId: string,
    poolId: string,
    signal?: AbortSignal,
  ): Promise<{ toPoolIds: readonly string[]; version: number | undefined }>;
  putHandoffs(
    teamId: string,
    ref: Ref,
    toPoolIds: readonly string[],
  ): Promise<{ toPoolIds: readonly string[]; version: number | undefined }>;

  secretBindings(
    teamId: string,
    poolId: string,
    signal?: AbortSignal,
  ): Promise<{ items: readonly SecretBindingRecord[]; version: number | undefined }>;
  putSecretBindings(
    teamId: string,
    ref: Ref,
    items: readonly SecretBindingRecord[],
  ): Promise<{ items: readonly SecretBindingRecord[]; version: number | undefined }>;

  configValues(
    teamId: string,
    poolId: string,
    signal?: AbortSignal,
  ): Promise<readonly ConfigValueRow[]>;
  putConfigValue(
    teamId: string,
    poolId: string,
    value: { name: string; source: "literal" | "namespace"; value?: string },
  ): Promise<ConfigValueRow>;
  deleteConfigValue(teamId: string, poolId: string, name: string): Promise<void>;

  externalSystems(
    teamId: string,
    poolId: string,
    signal?: AbortSignal,
  ): Promise<readonly { id: string; name: string; enabled: boolean }[]>;
  putExternalSystem(
    teamId: string,
    poolId: string,
    systemId: string,
    enabled: boolean,
  ): Promise<void>;

  roleLinks(
    teamId: string,
    poolId: string,
    signal?: AbortSignal,
  ): Promise<readonly PoolRoleLinkRecord[]>;
  createRoleLink(
    teamId: string,
    poolId: string,
    input: PoolRoleLinkInput,
  ): Promise<PoolRoleLinkRecord>;
  deleteRoleLink(teamId: string, poolId: string, ref: Ref): Promise<void>;
  verifyRoleLink(teamId: string, poolId: string, linkId: string): Promise<PoolRoleLinkRecord>;
}
