// The secrets port (M2-S1): `ListSecrets`, `CreateSecret`, `UpdateSecret`, `DeleteSecret`, `PutSecretValue`,
// `RotateSecret`. A secret *value* appears only as an argument of `create`, `putValue` and `rotate`; no
// record, result or error here ever carries one (WEB-8).

export interface RotationRecord {
  readonly enabled?: boolean | undefined;
  readonly days?: number | undefined;
}

export interface SecretRecord {
  readonly id: string;
  readonly name: string;
  readonly scope: string;
  readonly description?: string | undefined;
  readonly agentId?: string | undefined;
  /** `user` (or absent) for the team's own secrets; `afs` and `paperclip` are managed and read-only (WEB-US-54). */
  readonly managedBy?: string | undefined;
  readonly poolId?: string | undefined;
  readonly externalSystemId?: string | null | undefined;
  /** Ids of the agents (or pools) the secret is bound to. */
  readonly boundTo: readonly string[];
  readonly rotation?: RotationRecord | undefined;
  readonly secretsManagerPath: string;
  readonly lastChangedAt?: string | undefined;
  readonly createdAt?: string | undefined;
  readonly version: number;
}

export interface CreateSecretInput {
  readonly scope: "team" | "agent";
  readonly name: string;
  readonly description?: string | undefined;
  readonly agentId?: string | undefined;
  readonly externalSystemId?: string | undefined;
  readonly rotation?: RotationRecord | undefined;
}

export interface SecretRef {
  readonly id: string;
  readonly version: number;
}

export interface UpdateSecretInput {
  readonly description?: string | undefined;
  readonly externalSystemId?: string | null | undefined;
  readonly rotation?: RotationRecord | undefined;
}

export interface SecretsPort {
  list(teamId: string, signal?: AbortSignal): Promise<readonly SecretRecord[]>;
  /** `value` is sent once and not kept. */
  create(teamId: string, input: CreateSecretInput, value: string): Promise<SecretRecord>;
  update(teamId: string, ref: SecretRef, input: UpdateSecretInput): Promise<SecretRecord>;
  delete(teamId: string, ref: SecretRef): Promise<void>;
  putValue(teamId: string, ref: SecretRef, value: string): Promise<void>;
  rotate(teamId: string, secretId: string, value: string): Promise<SecretRecord>;
}
