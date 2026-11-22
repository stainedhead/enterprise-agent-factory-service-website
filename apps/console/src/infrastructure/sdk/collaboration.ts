import {
  type AfsClient,
  adminCollaborationEndpoints,
  type CollaborationEndpoint,
  createCollaboration,
  createReports,
  secrets,
} from "@afs/sdk";
import type {
  AccessReport,
  CollaborationPort,
  CollaborationRecord,
  EndpointRecord,
  EndpointsPage,
  EndpointsQuery,
  LinkRecord,
  LinksPage,
  LinksQuery,
  ManagedSecretsPage,
  PutCollaborationInput,
  RotateResult,
} from "../../application/ports/collaboration.js";
import type { AccessRow } from "../../domain/collaboration.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof createCollaboration>["get"]>>;
type WireLink = Awaited<ReturnType<ReturnType<typeof createCollaboration>["connectAgent"]>>;

const toRecord = (c: Wire): CollaborationRecord => ({
  teamId: c.teamId,
  agentId: c.agentId,
  version: c.version,
  generation: c.generation,
  hostname: c.hostname,
  webUiEnabled: c.webUiEnabled,
  restApiEnabled: c.restApiEnabled,
  webUiUrl: c.webUiUrl,
  restApiUrl: c.restApiUrl,
  registrationMode: c.registrationMode,
  effective: {
    webUi: c.effective.webUi,
    restApi: c.effective.restApi,
    reasons: c.effective.reasons,
  },
  phase: c.status.phase,
  observedGeneration: c.status.observedGeneration,
  conditions: (c.status.conditions ?? []).map((x) => ({
    type: x.type,
    status: x.status,
    reason: x.reason,
    message: x.message,
  })),
  unmanagedPaperclipAgents: c.unmanagedPaperclipAgents,
});

const toLink = (l: WireLink): LinkRecord => ({
  agentId: l.agentId,
  agentName: l.agentName,
  connect: l.connect,
  linkState: l.linkState,
  paperclipAgentId: l.paperclipAgentId,
  lastSyncedAt: l.lastSyncedAt,
  lastError: l.lastError,
  version: l.version,
});

const toEndpoint = (e: CollaborationEndpoint): EndpointRecord => ({
  teamId: e.teamId,
  slug: e.slug,
  hostname: e.hostname,
  webUi: e.effective.webUi,
  restApi: e.effective.restApi,
  phase: e.phase,
  teamState: e.teamState,
  mayExposeCollaboration: e.mayExposeCollaboration,
  lastAccessAt: e.lastAccessAt,
});

/** `collaboration.*`, `secrets.list({managedBy})`, the collaboration report and `admin.collaborationEndpoints` mapped to {@link CollaborationPort}. */
export class SdkCollaboration implements CollaborationPort {
  readonly #collab;
  readonly #reports;
  constructor(private readonly client: AfsClient) {
    this.#collab = createCollaboration(client);
    this.#reports = createReports(client);
  }

  get(teamId: string, signal?: AbortSignal): Promise<CollaborationRecord> {
    return wrap(async () => toRecord(await this.#collab.get(teamId, sig(signal))));
  }

  put(
    teamId: string,
    ref: { version: number },
    input: PutCollaborationInput,
  ): Promise<CollaborationRecord> {
    return wrap(async () =>
      toRecord(
        await this.#collab.put(
          { id: teamId, version: ref.version },
          {
            webUiEnabled: input.webUiEnabled,
            restApiEnabled: input.restApiEnabled,
            ...(input.registrationMode !== undefined && {
              registrationMode: input.registrationMode,
            }),
          },
        ),
      ),
    );
  }

  listLinks(teamId: string, query: LinksQuery, signal?: AbortSignal): Promise<LinksPage> {
    return wrap(async () => {
      const p = await this.#collab.links
        .list(teamId, {
          ...(query.linkState && { linkState: query.linkState }),
          ...(query.maxResults !== undefined && { maxResults: query.maxResults }),
          ...(query.nextToken && { nextToken: query.nextToken }),
          ...sig(signal),
        })
        .first();
      return { items: p.items.map(toLink), nextToken: p.nextToken };
    });
  }

  connect(teamId: string, agentId: string, paperclipAgentId?: string): Promise<LinkRecord> {
    return wrap(async () =>
      toLink(
        await this.#collab.connectAgent(
          teamId,
          agentId,
          paperclipAgentId ? { paperclipAgentId } : undefined,
        ),
      ),
    );
  }

  disconnect(teamId: string, agentId: string): Promise<LinkRecord> {
    return wrap(async () => toLink(await this.#collab.disconnectAgent(teamId, agentId)));
  }

  rotateKeys(teamId: string, names: readonly string[]): Promise<RotateResult> {
    return wrap(async () => {
      const r = await this.#collab.rotateKeys(teamId, { names: [...names] });
      return {
        rotated: r.rotated.map((x) => ({ name: x.name, versionId: x.versionId })),
        signsOutEveryone: r.signsOutEveryone,
        agentRolloutPending: r.agentRolloutPending,
      };
    });
  }

  listManagedSecrets(
    teamId: string,
    managedBy: "afs" | "paperclip",
    signal?: AbortSignal,
  ): Promise<ManagedSecretsPage> {
    return wrap(async () => {
      const p = await secrets(this.client)
        .list(teamId, { managedBy, maxResults: 100, ...sig(signal) })
        .first();
      return {
        items: p.items.map((s) => ({
          id: s.id,
          name: s.name,
          managedBy: s.managedBy ?? managedBy,
          agentId: s.agentId,
          lastChangedAt: s.lastChangedAt,
        })),
        more: p.nextToken !== undefined,
      };
    });
  }

  recentAccess(teamId: string, signal?: AbortSignal): Promise<AccessReport> {
    return wrap(async () => {
      const r = await this.#reports.team(teamId, "collaboration", {
        range: "7d",
        groupBy: ["day", "person"],
        ...sig(signal),
      });
      const n = (k: string) => (typeof r.totals[k] === "number" ? (r.totals[k] as number) : 0);
      return {
        signIns: n("signIns"),
        uniquePeople: n("uniquePeople"),
        deniedRequests: n("deniedRequests"),
        rows: r.rows as readonly AccessRow[],
      };
    });
  }

  listEndpoints(query: EndpointsQuery, signal?: AbortSignal): Promise<EndpointsPage> {
    return wrap(async () => {
      const p = await adminCollaborationEndpoints(this.client)
        .list({ ...endpointOptions(query), ...sig(signal) })
        .first();
      return { items: p.items.map(toEndpoint), nextToken: p.nextToken };
    });
  }

  endpointsCsv(query: EndpointsQuery): Promise<string> {
    return wrap(() =>
      adminCollaborationEndpoints(this.client).list(endpointOptions(query)).asCsv(),
    );
  }
}

const endpointOptions = (q: EndpointsQuery) => ({
  ...(q.teamId && { teamId: q.teamId }),
  ...(q.state && { state: q.state }),
  ...(q.maxResults !== undefined && { maxResults: q.maxResults }),
  ...(q.nextToken && { nextToken: q.nextToken }),
});
