import {
  aggregatePeople,
  isCollaborationManaged,
  type PersonAccess,
} from "../../../domain/collaboration.js";
import { AppError } from "../../errors.js";
import type {
  CollaborationPort,
  CollaborationRecord,
  EndpointsQuery,
  LinkRecord,
  LinksQuery,
  ManagedSecretRecord,
  RotateResult,
} from "../../ports/collaboration.js";

export const AGENT_MISSING = "collaboration_agent_missing";

/** True for the `404 collaboration_agent_missing` of a team with no collaboration agent (PC-D19). */
export const isAgentMissing = (e: unknown): boolean =>
  e instanceof AppError &&
  (e.kind === "not-found" || e.kind === "conflict") &&
  e.reason === AGENT_MISSING;

export interface ManagedSecrets {
  readonly items: readonly ManagedSecretRecord[];
  /** Either call had a next page: the panel says "More on Secrets". */
  readonly more: boolean;
}

export interface RecentAccess {
  readonly signIns: number;
  readonly people: number;
  readonly denied: number;
  readonly top: readonly PersonAccess[];
}

export interface BulkResult {
  readonly agentId: string;
  readonly agentName: string;
  readonly ok: boolean;
  readonly message?: string | undefined;
  readonly requestId?: string | undefined;
}

/** The collaboration area: load the page data, put the switches, connect, disconnect, rotate, recent access. */
export class CollaborationUseCases {
  constructor(private readonly port: CollaborationPort) {}

  get(teamId: string, signal?: AbortSignal): Promise<CollaborationRecord> {
    return this.port.get(teamId, signal);
  }

  /** Sends both switch values (the changed one flipped) with the version the page was showing. */
  put(
    teamId: string,
    current: Pick<CollaborationRecord, "version">,
    input: { webUiEnabled: boolean; restApiEnabled: boolean; registrationMode?: string },
  ): Promise<CollaborationRecord> {
    return this.port.put(teamId, { version: current.version }, input);
  }

  listLinks(teamId: string, query: LinksQuery = {}, signal?: AbortSignal) {
    return this.port.listLinks(teamId, query, signal);
  }

  connect(teamId: string, agentId: string, paperclipAgentId?: string): Promise<LinkRecord> {
    return this.port.connect(teamId, agentId, paperclipAgentId?.trim() || undefined);
  }

  disconnect(teamId: string, agentId: string): Promise<LinkRecord> {
    return this.port.disconnect(teamId, agentId);
  }

  /**
   * One call per agent, one after another; a failure does not stop the others and nothing is rolled back
   * (WP-D5). `paperclipIds` is used only for connect in manual registration.
   */
  async bulk(
    teamId: string,
    kind: "connect" | "disconnect",
    agents: readonly { id: string; name: string }[],
    paperclipIds: Readonly<Record<string, string>> = {},
  ): Promise<BulkResult[]> {
    const out: BulkResult[] = [];
    for (const a of agents) {
      try {
        if (kind === "connect") await this.connect(teamId, a.id, paperclipIds[a.id]);
        else await this.disconnect(teamId, a.id);
        out.push({ agentId: a.id, agentName: a.name, ok: true });
      } catch (e) {
        out.push({
          agentId: a.id,
          agentName: a.name,
          ok: false,
          message: e instanceof AppError ? e.message : "The request failed",
          requestId: e instanceof AppError ? e.requestId : undefined,
        });
      }
    }
    return out;
  }

  rotateKeys(teamId: string, names: readonly string[]): Promise<RotateResult> {
    return this.port.rotateKeys(teamId, names);
  }

  /** Two filtered lists, kept to the collaboration agent's secrets (WP-D7). */
  async managedSecrets(
    teamId: string,
    collaborationAgentId: string,
    signal?: AbortSignal,
  ): Promise<ManagedSecrets> {
    const [paperclip, afs] = await Promise.all([
      this.port.listManagedSecrets(teamId, "paperclip", signal),
      this.port.listManagedSecrets(teamId, "afs", signal),
    ]);
    return {
      items: [...paperclip.items, ...afs.items].filter((s) =>
        isCollaborationManaged(s, collaborationAgentId),
      ),
      more: paperclip.more || afs.more,
    };
  }

  /** One report call; the people are aggregated here (no extra calls). */
  async recentAccess(teamId: string, signal?: AbortSignal): Promise<RecentAccess> {
    const r = await this.port.recentAccess(teamId, signal);
    return {
      signIns: r.signIns,
      people: r.uniquePeople,
      denied: r.deniedRequests,
      top: aggregatePeople(r.rows, 10),
    };
  }

  listEndpoints(query: EndpointsQuery, signal?: AbortSignal) {
    return this.port.listEndpoints(query, signal);
  }

  endpointsCsv(query: EndpointsQuery): Promise<string> {
    return this.port.endpointsCsv(query);
  }
}
