import { AppError } from "../../errors.js";
import type {
  AgentRecord,
  AgentRef,
  AgentsPort,
  AgentTemplateRecord,
  CreateAgentInput,
  LogDestinationRecord,
  SnapshotRecord,
  StorageClassRecord,
  UpdateAgentInput,
} from "../../ports/agents.js";
import type { StatusRecord } from "../../ports/teams.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** An agent with its month-to-date cost; `costUsd` is undefined when the usage report could not be read. */
export interface AgentRow extends AgentRecord {
  readonly costUsd: string | undefined;
}

export const MIN_VOLUME_GIB = 1;
export const MAX_VOLUME_GIB = 1000;

/** The agents of a team (M2-A1). Mutations are one API call each; the API decides what is allowed. */
export class AgentsUseCases {
  constructor(private readonly port: AgentsPort) {}

  /** The team's agents with their month-to-date cost (WEB-US-25.1); a failed cost read leaves the cost blank. */
  async list(teamId: string, signal?: AbortSignal): Promise<readonly AgentRow[]> {
    const [agents, costs] = await Promise.all([
      this.port.list(teamId, signal),
      this.port.monthCosts(teamId, signal).catch(() => undefined),
    ]);
    return agents.map((a) => ({ ...a, costUsd: costs ? (costs[a.id] ?? "0.00") : undefined }));
  }

  get(teamId: string, agentId: string, signal?: AbortSignal): Promise<AgentRecord> {
    return this.port.get(teamId, agentId, signal);
  }

  create(teamId: string, input: CreateAgentInput): Promise<AgentRecord> {
    return this.port.create(teamId, input);
  }

  update(teamId: string, ref: AgentRef, input: UpdateAgentInput): Promise<AgentRecord> {
    return this.port.update(teamId, ref, input);
  }

  delete(teamId: string, ref: AgentRef): Promise<AgentRecord> {
    return this.port.delete(teamId, ref);
  }

  restart(teamId: string, agentId: string): Promise<AgentRecord> {
    return this.port.restart(teamId, agentId);
  }

  pause(teamId: string, agentId: string): Promise<AgentRecord> {
    return this.port.pause(teamId, agentId);
  }

  resume(teamId: string, agentId: string): Promise<AgentRecord> {
    return this.port.resume(teamId, agentId);
  }

  status(teamId: string, agentId: string, signal?: AbortSignal): Promise<StatusRecord> {
    return this.port.status(teamId, agentId, signal);
  }

  snapshots(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly SnapshotRecord[]> {
    return this.port.snapshots(teamId, agentId, signal);
  }

  takeSnapshot(teamId: string, agentId: string, description?: string): Promise<SnapshotRecord> {
    return this.port.createSnapshot(teamId, agentId, description?.trim() || undefined);
  }

  templates(signal?: AbortSignal): Promise<readonly AgentTemplateRecord[]> {
    return this.port.templates(signal);
  }

  storageClasses(signal?: AbortSignal): Promise<readonly StorageClassRecord[]> {
    return this.port.storageClasses(signal);
  }

  logDestinations(teamId: string, signal?: AbortSignal): Promise<readonly LogDestinationRecord[]> {
    return this.port.logDestinations(teamId, signal);
  }

  /**
   * Grows the volume (WEB-US-25.3): only a larger whole number of GiB is sent. A smaller or equal size is
   * refused here, before any request; the API's own refusal (for example a quota) is passed through.
   */
  expandVolume(
    teamId: string,
    agent: AgentRef & { volume?: { sizeGiB?: number | undefined } | undefined },
    size: number,
  ) {
    const current = agent.volume?.sizeGiB ?? 0;
    if (!Number.isInteger(size) || size > MAX_VOLUME_GIB)
      return Promise.reject(
        invalid("volume.sizeGiB", `Enter a whole number of GiB up to ${MAX_VOLUME_GIB}`),
      );
    if (size <= current)
      return Promise.reject(
        invalid("volume.sizeGiB", `A volume can only grow: enter more than ${current} GiB`),
      );
    return this.port.update(
      teamId,
      { id: agent.id, version: agent.version },
      { volume: { sizeGiB: size } },
    );
  }
}

/** Every status phase an agent list shows, for the one polling decision of the page (WD-21). */
export const agentPhases = (agents: readonly AgentRecord[]): string[] =>
  agents.map((a) => (a.paused ? "Ready" : a.status.phase));

/** `TemplateRetired=True` on the agent's status (WEB-US-22.3). */
export const isTemplateRetired = (a: Pick<AgentRecord, "status">): boolean =>
  a.status.conditions.some((c) => c.type === "TemplateRetired" && c.status === "True");
