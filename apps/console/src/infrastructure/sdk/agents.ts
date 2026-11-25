import {
  type AfsClient,
  agents,
  agentTemplates,
  logDestinations,
  storageClasses,
  usage,
} from "@afs/sdk";
import type {
  AgentModelsRecord,
  AgentRecord,
  AgentRef,
  AgentRole,
  AgentsPort,
  AgentTemplateRecord,
  CreateAgentInput,
  LogDestinationRecord,
  SnapshotRecord,
  StorageClassRecord,
  UpdateAgentInput,
} from "../../application/ports/agents.js";
import type { StatusRecord } from "../../application/ports/teams.js";
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

/** Drops `undefined` members so the request body carries only what the form set. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const body = (i: CreateAgentInput | UpdateAgentInput) =>
  compact({
    ...i,
    resources: i.resources ? compact({ ...i.resources }) : undefined,
    volume: i.volume ? compact({ ...i.volume }) : undefined,
    secretBindings: i.secretBindings ? i.secretBindings.map((b) => ({ ...b })) : undefined,
  }) as never;

type WireAgent = Awaited<ReturnType<ReturnType<typeof agents>["get"]>>;

/** `models` of the wire; a 1.0.1 agent that only has `modelId` reads as `all` with that default. */
export const toModels = (
  m: WireAgent["models"] | undefined,
  modelId?: string,
): AgentModelsRecord => ({
  access: m?.access === "selected" ? "selected" : "all",
  modelIds: m?.modelIds ?? [],
  defaultModelId: m?.defaultModelId ?? modelId ?? "",
  ...(m?.effectiveModelIds && { effectiveModelIds: m.effectiveModelIds }),
  ...(m?.routeAccess && { routeAccess: m.routeAccess === "selected" ? "selected" : "all" }),
  ...(m?.routes && { routes: m.routes }),
  ...(m?.defaultRoute !== undefined && { defaultRoute: m.defaultRoute }),
  ...(m?.effectiveRoutes && { effectiveRoutes: m.effectiveRoutes }),
  ...(m?.env && { env: m.env }),
});

const toAgent = (a: WireAgent): AgentRecord => {
  const { modelId, models, image, template, ...rest } = a;
  return {
    ...rest,
    template: template ?? null,
    image: image ?? null,
    models: toModels(models, modelId),
    secretBindings: a.secretBindings ?? [],
  };
};

/** `agents.*` calls mapped to {@link AgentsPort}. */
export class SdkAgents implements AgentsPort {
  constructor(private readonly client: AfsClient) {}

  list(
    teamId: string,
    signal?: AbortSignal,
    opts?: { readonly role?: AgentRole },
  ): Promise<readonly AgentRecord[]> {
    return wrap(async () =>
      (
        await all(
          agents(this.client).list(teamId, {
            maxResults: 100,
            ...(opts?.role ? { role: opts.role } : {}),
            ...sig(signal),
          }),
        )
      ).map(toAgent),
    );
  }
  get(teamId: string, agentId: string, signal?: AbortSignal): Promise<AgentRecord> {
    return wrap(async () => toAgent(await agents(this.client).get(teamId, agentId, sig(signal))));
  }
  create(teamId: string, input: CreateAgentInput): Promise<AgentRecord> {
    return wrap(async () => toAgent(await agents(this.client).create(teamId, body(input))));
  }
  update(teamId: string, ref: AgentRef, input: UpdateAgentInput): Promise<AgentRecord> {
    return wrap(async () =>
      toAgent(
        await agents(this.client).update(teamId, { id: ref.id, version: ref.version }, body(input)),
      ),
    );
  }
  delete(teamId: string, ref: AgentRef): Promise<AgentRecord> {
    return wrap(async () =>
      toAgent(await agents(this.client).delete(teamId, { id: ref.id, version: ref.version })),
    );
  }
  pause(teamId: string, agentId: string): Promise<AgentRecord> {
    return wrap(async () => toAgent(await agents(this.client).pause(teamId, agentId)));
  }
  resume(teamId: string, agentId: string): Promise<AgentRecord> {
    return wrap(async () => toAgent(await agents(this.client).resume(teamId, agentId)));
  }
  restart(teamId: string, agentId: string): Promise<AgentRecord> {
    return wrap(async () => toAgent(await agents(this.client).restart(teamId, agentId)));
  }
  status(teamId: string, agentId: string, signal?: AbortSignal): Promise<StatusRecord> {
    return wrap(
      async () => (await agents(this.client).getStatus(teamId, agentId, sig(signal))).status,
    );
  }
  snapshots(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly SnapshotRecord[]> {
    return wrap(() =>
      all(agents(this.client).snapshots.list(teamId, agentId, { maxResults: 100, ...sig(signal) })),
    );
  }
  createSnapshot(teamId: string, agentId: string, description?: string): Promise<SnapshotRecord> {
    return wrap(() =>
      agents(this.client).snapshots.create(teamId, agentId, description ? { description } : {}),
    );
  }
  templates(
    signal?: AbortSignal,
    opts?: { readonly capability?: string },
  ): Promise<readonly AgentTemplateRecord[]> {
    return wrap(() =>
      all(
        agentTemplates(this.client).list({
          maxResults: 100,
          ...(opts?.capability ? { capability: opts.capability } : {}),
          ...sig(signal),
        }),
      ),
    );
  }
  storageClasses(signal?: AbortSignal) {
    return wrap<readonly StorageClassRecord[]>(() =>
      all(storageClasses(this.client).list({ maxResults: 100, ...sig(signal) })),
    );
  }
  logDestinations(teamId: string, signal?: AbortSignal): Promise<readonly LogDestinationRecord[]> {
    return wrap(() =>
      all(logDestinations(this.client).list(teamId, { maxResults: 100, ...sig(signal) })),
    );
  }
  monthCosts(teamId: string, signal?: AbortSignal): Promise<Readonly<Record<string, string>>> {
    return wrap(async () => {
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const u = await usage(this.client).get(teamId, { from, groupBy: "agent", ...sig(signal) });
      const out: Record<string, string> = {};
      for (const row of u.rows) {
        const id = row.key.agent ?? row.key.agentId;
        if (id) out[id] = row.costUsd;
      }
      return out;
    });
  }
}
