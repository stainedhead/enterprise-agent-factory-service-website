import { type AfsClient, adminOrchestrationEndpoints, createOrchestration } from "@afs/sdk";
import type {
  EndpointsPage,
  EndpointsQuery,
  MigrationRecord,
  OrchestrationEndpointRecord,
  OrchestrationPort,
  OrchestrationRecord,
  PutOrchestrationInput,
  SurfaceRecord,
} from "../../application/ports/orchestration.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof createOrchestration>["get"]>>;

const toSurface = (s: Wire["webUi"]): SurfaceRecord => ({
  supported: s.supported,
  exposure: s.exposure,
  effective: s.effective,
  reasons: s.reasons,
  hostname: s.hostname,
  url: s.url,
});

const toRecord = (o: Wire): OrchestrationRecord => ({
  teamId: o.teamId,
  agentId: o.agentId,
  agentName: o.agentName,
  phase: o.phase,
  tool: o.tool,
  toolVersion: o.toolVersion,
  registrationMode: o.registrationMode,
  limit: o.limit,
  webUi: toSurface(o.webUi),
  webApi: toSurface(o.webApi),
  connectedAgents: o.connectedAgents,
  unmanagedToolAgents: o.unmanagedToolAgents,
  version: o.version,
  generation: o.generation,
  observedGeneration: o.status.observedGeneration,
  conditions: (o.status.conditions ?? []).map((x) => ({
    type: x.type,
    status: x.status,
    reason: x.reason,
    message: x.message,
  })),
});

const options = (q: EndpointsQuery) => ({
  ...(q.exposure && { exposure: q.exposure }),
  ...(q.tool && { tool: q.tool }),
  ...(q.teamId && { teamId: q.teamId }),
  ...(q.state && { state: q.state }),
  ...(q.maxResults !== undefined && { maxResults: q.maxResults }),
  ...(q.nextToken && { nextToken: q.nextToken }),
});

/** `orchestration.*` and `admin.orchestrationEndpoints` mapped to {@link OrchestrationPort}. */
export class SdkOrchestration implements OrchestrationPort {
  readonly #api;
  constructor(private readonly client: AfsClient) {
    this.#api = createOrchestration(client);
  }

  get(teamId: string, signal?: AbortSignal): Promise<OrchestrationRecord> {
    return wrap(async () => toRecord(await this.#api.get(teamId, sig(signal))));
  }

  put(
    teamId: string,
    ref: { version: number },
    input: PutOrchestrationInput,
  ): Promise<OrchestrationRecord> {
    return wrap(async () =>
      toRecord(
        await this.#api.put(
          { id: teamId, version: ref.version },
          {
            webUi: { exposure: input.webUi },
            webApi: { exposure: input.webApi },
            ...(input.registrationMode !== undefined && {
              registrationMode: input.registrationMode,
            }),
          },
        ),
      ),
    );
  }

  changeTool(teamId: string, tool: string): Promise<OrchestrationRecord> {
    return wrap(async () => toRecord(await this.#api.changeTool(teamId, { tool })));
  }

  listEndpoints(query: EndpointsQuery, signal?: AbortSignal): Promise<EndpointsPage> {
    return wrap(async () => {
      const p = await adminOrchestrationEndpoints(this.client)
        .list({ ...options(query), ...sig(signal) })
        .first();
      return {
        items: p.items.map((e): OrchestrationEndpointRecord => ({ ...e })),
        nextToken: p.nextToken,
        migration: p.extras?.migration as MigrationRecord | undefined,
      };
    });
  }

  endpointsCsv(query: EndpointsQuery): Promise<string> {
    return wrap(() => adminOrchestrationEndpoints(this.client).list(options(query)).asCsv());
  }
}
