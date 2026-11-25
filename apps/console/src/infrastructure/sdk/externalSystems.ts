import { type AfsClient, adminExternalSystems, externalSystems } from "@afs/sdk";
import type {
  AdminExternalSystemsPort,
  CatalogSystemInput,
  CatalogSystemUpdate,
} from "../../application/ports/adminExternalSystems.js";
import type {
  DeclareSystemInput,
  ExternalSystemRecord,
  ExternalSystemsPort,
  SystemRef,
  UpdateSystemInput,
} from "../../application/ports/externalSystems.js";
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

type Wire = Awaited<ReturnType<ReturnType<typeof externalSystems>["team"]["declare"]>>;
/** Maps a wire system; shared with the service catalog adapter. */
export const toSystem = (s: Wire): ExternalSystemRecord => ({
  id: s.id,
  name: s.name,
  slug: s.slug,
  category: s.category,
  description: s.description,
  docsUrl: s.docsUrl,
  owner: s.owner,
  purpose: s.purpose,
  endpoints: s.endpoints,
  enabled: s.enabled,
  builtin: s.builtin,
  scope: s.scope,
  disabledAt: s.disabledAt,
  teamState: s.teamState,
  unmetered: s.unmetered === true,
  version: s.version,
  ...(s.governedBy ? { governedBy: s.governedBy } : {}),
});

const target = (r: SystemRef) =>
  r.version === undefined ? r.id : { id: r.id, version: r.version };
const compact = (o: object): never =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as never;

/** `externalSystems.*` calls mapped to {@link ExternalSystemsPort}. */
export class SdkExternalSystems implements ExternalSystemsPort {
  constructor(private readonly client: AfsClient) {}

  listTeam(teamId: string, signal?: AbortSignal) {
    return wrap(async () =>
      (
        await all(
          externalSystems(this.client).team.list(teamId, { maxResults: 100, ...sig(signal) }),
        )
      ).map(toSystem),
    );
  }
  declare(teamId: string, input: DeclareSystemInput) {
    return wrap(async () =>
      toSystem(
        await externalSystems(this.client).team.declare(
          teamId,
          compact({ ...input, endpoints: [...input.endpoints] }),
        ),
      ),
    );
  }
  updateTeam(teamId: string, ref: SystemRef, input: UpdateSystemInput) {
    return wrap(async () =>
      toSystem(
        await externalSystems(this.client).team.update(
          teamId,
          target(ref),
          compact({ ...input, ...(input.endpoints && { endpoints: [...input.endpoints] }) }),
        ),
      ),
    );
  }
  deleteTeam(teamId: string, ref: SystemRef) {
    return wrap(() => externalSystems(this.client).team.delete(teamId, target(ref)));
  }
  setTeamState(teamId: string, ref: SystemRef, enabled: boolean) {
    return wrap(async () =>
      toSystem(await externalSystems(this.client).team.setState(teamId, target(ref), { enabled })),
    );
  }
  listAgent(teamId: string, agentId: string, signal?: AbortSignal) {
    return wrap(async () =>
      (
        await all(
          externalSystems(this.client).agent.list(teamId, agentId, {
            maxResults: 100,
            ...sig(signal),
          }),
        )
      ).map(toSystem),
    );
  }
  setAgentState(teamId: string, agentId: string, ref: SystemRef, enabled: boolean) {
    return wrap(async () =>
      toSystem(
        await externalSystems(this.client).agent.setState(teamId, agentId, target(ref), {
          enabled,
        }),
      ),
    );
  }
}

/** `admin.externalSystems.*` mapped to {@link AdminExternalSystemsPort}. */
export class SdkAdminExternalSystems implements AdminExternalSystemsPort {
  constructor(private readonly client: AfsClient) {}

  list(signal?: AbortSignal) {
    return wrap(async () =>
      (await all(adminExternalSystems(this.client).list({ maxResults: 100, ...sig(signal) }))).map(
        toSystem,
      ),
    );
  }
  create(input: CatalogSystemInput) {
    return wrap(async () =>
      toSystem(
        await adminExternalSystems(this.client).create(
          compact({ ...input, endpoints: [...input.endpoints] }),
        ),
      ),
    );
  }
  update(ref: SystemRef, patch: CatalogSystemUpdate) {
    return wrap(async () =>
      toSystem(
        await adminExternalSystems(this.client).update(
          target(ref),
          compact({ ...patch, ...(patch.endpoints && { endpoints: [...patch.endpoints] }) }),
        ),
      ),
    );
  }
  delete(ref: SystemRef) {
    return wrap(() => adminExternalSystems(this.client).delete(target(ref)));
  }
}
