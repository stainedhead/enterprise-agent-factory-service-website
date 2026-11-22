import { type AfsClient, config } from "@afs/sdk";
import type {
  AgentConfigInput,
  ConfigRef,
  ConfigValueRecord,
  ConfigValuesPort,
} from "../../application/ports/configValues.js";
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

type Wire = Awaited<ReturnType<ReturnType<typeof config>["namespace"]["put"]>>;
const toRecord = (v: Wire): ConfigValueRecord => ({
  name: v.name,
  source: v.source,
  value: v.value,
  resolvedValue: v.resolvedValue,
  usedBy: v.usedBy ?? [],
  version: v.version,
  updatedAt: v.updatedAt,
});

/** A name, or a name with the version it was read at (sent as `If-Match`). */
const target = (r: ConfigRef) =>
  r.version === undefined ? r.name : { name: r.name, version: r.version };

/** `config.*` calls mapped to {@link ConfigValuesPort}. */
export class SdkConfig implements ConfigValuesPort {
  constructor(private readonly client: AfsClient) {}

  listNamespace(teamId: string, signal?: AbortSignal) {
    return wrap(async () =>
      (
        await all(config(this.client).namespace.list(teamId, { maxResults: 100, ...sig(signal) }))
      ).map(toRecord),
    );
  }
  putNamespace(teamId: string, ref: ConfigRef, value: string) {
    return wrap(async () =>
      toRecord(await config(this.client).namespace.put(teamId, target(ref), { value })),
    );
  }
  deleteNamespace(teamId: string, ref: ConfigRef) {
    return wrap(() => config(this.client).namespace.delete(teamId, target(ref)));
  }
  listAgent(teamId: string, agentId: string, signal?: AbortSignal) {
    return wrap(async () =>
      (
        await all(
          config(this.client).agent.list(teamId, agentId, { maxResults: 100, ...sig(signal) }),
        )
      ).map(toRecord),
    );
  }
  putAgent(teamId: string, agentId: string, ref: ConfigRef, input: AgentConfigInput) {
    return wrap(async () =>
      toRecord(
        await config(this.client).agent.put(teamId, agentId, target(ref), {
          source: input.source,
          ...(input.source === "literal" && input.value !== undefined && { value: input.value }),
        }),
      ),
    );
  }
  deleteAgent(teamId: string, agentId: string, ref: ConfigRef) {
    return wrap(() => config(this.client).agent.delete(teamId, agentId, target(ref)));
  }
}
