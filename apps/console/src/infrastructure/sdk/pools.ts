import { type AfsClient, pools } from "@afs/sdk";
import type {
  ConfigValueRow,
  CreatePoolInput,
  PoolRecord,
  PoolRoleLinkInput,
  PoolRoleLinkRecord,
  PoolStatusRecord,
  PoolsPort,
  Ref,
  StageRecord,
  UpdatePoolInput,
} from "../../application/ports/pools.js";
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
const compact = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

type Api = ReturnType<typeof pools>;
type WirePool = Awaited<ReturnType<Api["get"]>>;
type WireStage = Awaited<ReturnType<Api["stages"]["create"]>>;
type WireLink = Awaited<ReturnType<Api["roleLinks"]["verify"]>>;

const toPool = (p: WirePool): PoolRecord => ({
  id: p.id,
  name: p.name,
  description: p.description,
  template: p.template,
  image: p.image,
  modelId: p.modelId,
  persona: p.persona,
  workers: p.workers,
  stageId: p.stageId ?? null,
  state: p.state,
  handoffs: p.handoffs ?? [],
  scratchSizeGiB: p.scratchSizeGiB,
  sharedVolume: p.sharedVolume ?? "none",
  resources: p.resources,
  generation: p.generation,
  version: p.version,
  status: p.status,
});
const toStage = (s: WireStage): StageRecord => ({
  id: s.id,
  name: s.name,
  position: s.position,
  description: s.description,
  version: s.version,
});
const toLink = (l: WireLink): PoolRoleLinkRecord => ({
  id: l.id,
  accountId: l.accountId,
  roleName: l.roleName,
  profileName: l.profileName,
  status: l.status,
  lastVerifiedAt: l.lastVerifiedAt ?? undefined,
  lastError: l.lastError ?? undefined,
  version: l.version,
});
const body = <T extends object>(i: T): never => compact({ ...i }) as never;

/** `pools.*` mapped to {@link PoolsPort}. */
export class SdkPools implements PoolsPort {
  constructor(private readonly client: AfsClient) {}
  private get api() {
    return pools(this.client);
  }

  listStages(teamId: string, signal?: AbortSignal): Promise<readonly StageRecord[]> {
    return wrap(async () =>
      (await all(this.api.stages.list(teamId, { maxResults: 100, ...sig(signal) }))).map(toStage),
    );
  }
  createStage(
    teamId: string,
    input: { name: string; position: number; description?: string },
  ): Promise<StageRecord> {
    return wrap(async () => toStage(await this.api.stages.create(teamId, body(input))));
  }
  updateStage(
    teamId: string,
    ref: Ref,
    patch: { position?: number; description?: string },
  ): Promise<StageRecord> {
    return wrap(async () => toStage(await this.api.stages.update(teamId, { ...ref }, body(patch))));
  }
  deleteStage(teamId: string, ref: Ref): Promise<void> {
    return wrap(() => this.api.stages.delete(teamId, { ...ref }));
  }

  list(teamId: string, signal?: AbortSignal): Promise<readonly PoolRecord[]> {
    return wrap(async () =>
      (await all(this.api.list(teamId, { maxResults: 100, ...sig(signal) }))).map(toPool),
    );
  }
  get(teamId: string, poolId: string, signal?: AbortSignal): Promise<PoolRecord> {
    return wrap(async () => toPool(await this.api.get(teamId, poolId, sig(signal))));
  }
  create(teamId: string, input: CreatePoolInput): Promise<PoolRecord> {
    return wrap(async () =>
      toPool(
        await this.api.create(
          teamId,
          body({
            ...input,
            resources: input.resources ? compact({ ...input.resources }) : undefined,
          }),
        ),
      ),
    );
  }
  update(teamId: string, ref: Ref, patch: UpdatePoolInput): Promise<PoolRecord> {
    return wrap(async () =>
      toPool(
        await this.api.update(
          teamId,
          { ...ref },
          body({
            ...patch,
            resources: patch.resources ? compact({ ...patch.resources }) : undefined,
          }),
        ),
      ),
    );
  }
  delete(teamId: string, ref: Ref): Promise<PoolRecord> {
    return wrap(async () => toPool(await this.api.delete(teamId, { ...ref })));
  }
  scale(teamId: string, poolId: string, workers: number): Promise<PoolRecord> {
    return wrap(async () => toPool(await this.api.scale(teamId, poolId, { workers })));
  }
  pause(teamId: string, poolId: string): Promise<PoolRecord> {
    return wrap(async () => toPool(await this.api.pause(teamId, poolId)));
  }
  resume(teamId: string, poolId: string): Promise<PoolRecord> {
    return wrap(async () => toPool(await this.api.resume(teamId, poolId)));
  }
  status(teamId: string, poolId: string, signal?: AbortSignal): Promise<PoolStatusRecord> {
    return wrap(async () => {
      const s = await this.api.getStatus(teamId, poolId, sig(signal));
      return { status: s.status, workers: { ...s.workers } };
    });
  }

  handoffs(teamId: string, poolId: string, signal?: AbortSignal) {
    return wrap(async () => {
      const h = await this.api.handoffs.list(teamId, poolId, sig(signal));
      return { toPoolIds: h.toPoolIds, version: h.version };
    });
  }
  putHandoffs(teamId: string, ref: Ref, toPoolIds: readonly string[]) {
    return wrap(async () => {
      const h = await this.api.handoffs.put(teamId, { ...ref }, { toPoolIds: [...toPoolIds] });
      return { toPoolIds: h.toPoolIds, version: h.version };
    });
  }

  secretBindings(teamId: string, poolId: string, signal?: AbortSignal) {
    return wrap(async () => {
      const b = await this.api.secretBindings.list(teamId, poolId, sig(signal));
      return { items: b.items.map((x) => ({ ...x })), version: b.version };
    });
  }
  putSecretBindings(
    teamId: string,
    ref: Ref,
    items: readonly { secretId: string; delivery: string; target: string }[],
  ) {
    return wrap(async () => {
      const b = await this.api.secretBindings.put(
        teamId,
        { ...ref },
        { items: items.map((x) => ({ ...x })) },
      );
      return { items: b.items.map((x) => ({ ...x })), version: b.version };
    });
  }

  configValues(
    teamId: string,
    poolId: string,
    signal?: AbortSignal,
  ): Promise<readonly ConfigValueRow[]> {
    return wrap(async () =>
      (await all(this.api.config.list(teamId, poolId, { maxResults: 100, ...sig(signal) }))).map(
        (c) => ({ name: c.name, source: c.source, value: c.value }),
      ),
    );
  }
  putConfigValue(
    teamId: string,
    poolId: string,
    value: { name: string; source: "literal" | "namespace"; value?: string },
  ): Promise<ConfigValueRow> {
    return wrap(async () => {
      const c = await this.api.config.put(
        teamId,
        poolId,
        value.name,
        body({ source: value.source, value: value.value }),
      );
      return { name: c.name, source: c.source, value: c.value };
    });
  }
  deleteConfigValue(teamId: string, poolId: string, name: string): Promise<void> {
    return wrap(() => this.api.config.delete(teamId, poolId, name));
  }

  externalSystems(teamId: string, poolId: string, signal?: AbortSignal) {
    return wrap(async () =>
      (
        await all(
          this.api.externalSystems.list(teamId, poolId, { maxResults: 100, ...sig(signal) }),
        )
      ).map((s) => ({ id: s.id, name: s.name, enabled: s.enabled })),
    );
  }
  putExternalSystem(teamId: string, poolId: string, systemId: string, enabled: boolean) {
    return wrap(async () => {
      await this.api.externalSystems.put(teamId, poolId, systemId, { enabled });
    });
  }

  roleLinks(
    teamId: string,
    poolId: string,
    signal?: AbortSignal,
  ): Promise<readonly PoolRoleLinkRecord[]> {
    return wrap(async () =>
      (await all(this.api.roleLinks.list(teamId, poolId, { maxResults: 100, ...sig(signal) }))).map(
        toLink,
      ),
    );
  }
  createRoleLink(
    teamId: string,
    poolId: string,
    input: PoolRoleLinkInput,
  ): Promise<PoolRoleLinkRecord> {
    return wrap(async () => toLink(await this.api.roleLinks.create(teamId, poolId, body(input))));
  }
  deleteRoleLink(teamId: string, poolId: string, ref: Ref): Promise<void> {
    return wrap(() => this.api.roleLinks.delete(teamId, poolId, { ...ref }));
  }
  verifyRoleLink(teamId: string, poolId: string, linkId: string): Promise<PoolRoleLinkRecord> {
    return wrap(async () => toLink(await this.api.roleLinks.verify(teamId, poolId, linkId)));
  }
}
