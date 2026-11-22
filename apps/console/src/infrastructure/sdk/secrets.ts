import { type AfsClient, secrets } from "@afs/sdk";
import type {
  CreateSecretInput,
  SecretRecord,
  SecretRef,
  SecretsPort,
  UpdateSecretInput,
} from "../../application/ports/secrets.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

type Wire = Awaited<ReturnType<ReturnType<typeof secrets>["get"]>>;

/** Metadata only: the SDK type has no value field, and nothing is copied that is not named here. */
const toRecord = (s: Wire): SecretRecord => ({
  id: s.id,
  name: s.name,
  scope: s.scope,
  description: s.description,
  agentId: s.agentId,
  managedBy: s.managedBy,
  poolId: s.poolId,
  externalSystemId: s.externalSystemId,
  boundTo: s.boundTo ?? [],
  rotation: s.rotation,
  secretsManagerPath: s.secretsManagerPath,
  lastChangedAt: s.lastChangedAt,
  createdAt: s.createdAt,
  version: s.version,
});

/** `secrets.*` calls mapped to {@link SecretsPort}. */
export class SdkSecrets implements SecretsPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly SecretRecord[]> {
    return wrap(async () =>
      (await all(secrets(this.client).list(teamId, { maxResults: 100, ...sig(signal) }))).map(
        toRecord,
      ),
    );
  }
  create(teamId: string, input: CreateSecretInput, value: string): Promise<SecretRecord> {
    return wrap(async () =>
      toRecord(
        await secrets(this.client).create(teamId, {
          scope: input.scope,
          name: input.name,
          ...(input.description && { description: input.description }),
          ...(input.agentId && { agentId: input.agentId }),
          ...(input.externalSystemId && { externalSystemId: input.externalSystemId }),
          ...(input.rotation && { rotation: { ...input.rotation } as never }),
          value,
        }),
      ),
    );
  }
  update(teamId: string, ref: SecretRef, input: UpdateSecretInput): Promise<SecretRecord> {
    return wrap(async () =>
      toRecord(
        await secrets(this.client).update(
          teamId,
          { id: ref.id, version: ref.version },
          {
            ...(input.description !== undefined && { description: input.description }),
            ...(input.externalSystemId !== undefined && {
              externalSystemId: input.externalSystemId,
            }),
            ...(input.rotation && { rotation: { ...input.rotation } as never }),
          },
        ),
      ),
    );
  }
  delete(teamId: string, ref: SecretRef): Promise<void> {
    return wrap(() => secrets(this.client).delete(teamId, { id: ref.id, version: ref.version }));
  }
  putValue(teamId: string, ref: SecretRef, value: string): Promise<void> {
    return wrap(() =>
      secrets(this.client).putValue(teamId, { id: ref.id, version: ref.version }, { value }),
    );
  }
  rotate(teamId: string, secretId: string, value: string): Promise<SecretRecord> {
    return wrap(async () =>
      toRecord(await secrets(this.client).rotate(teamId, secretId, { value })),
    );
  }
}
