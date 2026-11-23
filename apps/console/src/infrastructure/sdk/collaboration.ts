import { type AfsClient, createCollaboration, createReports, secrets } from "@afs/sdk";
import type {
  AccessReport,
  CollaborationPort,
  LinkRecord,
  LinksPage,
  LinksQuery,
  ManagedSecretsPage,
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

type WireLink = Awaited<ReturnType<ReturnType<typeof createCollaboration>["connectAgent"]>>;

const toLink = (l: WireLink): LinkRecord => ({
  agentId: l.agentId,
  agentName: l.agentName,
  connect: l.connect,
  linkState: l.linkState,
  paperclipAgentId: l.paperclipAgentId,
  toolAgentId: l.toolAgentId,
  lastSyncedAt: l.lastSyncedAt,
  lastError: l.lastError,
  version: l.version,
});

/** `collaboration.*`, `secrets.list({managedBy})`, the collaboration report and mapped to {@link CollaborationPort}. */
export class SdkCollaboration implements CollaborationPort {
  readonly #collab;
  readonly #reports;
  constructor(private readonly client: AfsClient) {
    this.#collab = createCollaboration(client);
    this.#reports = createReports(client);
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
}
