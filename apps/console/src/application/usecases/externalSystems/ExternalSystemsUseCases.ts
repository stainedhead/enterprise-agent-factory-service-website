import { AppError } from "../../errors.js";
import type {
  DeclareSystemInput,
  ExternalSystemRecord,
  ExternalSystemsPort,
  SystemRef,
  UpdateSystemInput,
} from "../../ports/externalSystems.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

export type SystemLevel = "service" | "team" | "agent";

/** The state a switch shows: on or off, and for an off one the level that turned it off. */
export interface SwitchState {
  readonly on: boolean;
  readonly level: SystemLevel | undefined;
  /** A system off at a level above the one being edited cannot be switched here. */
  readonly locked: boolean;
}

/**
 * The switch for `system` seen at `editing` (WEB-US-32.1, 32.3): a system off at a higher level is shown off
 * and locked, naming that level; off at the level being edited is off and editable.
 */
export function switchState(system: ExternalSystemRecord, editing: "team" | "agent"): SwitchState {
  const level = (system.disabledAt ?? undefined) as SystemLevel | undefined;
  if (!level && system.enabled !== false) return { on: true, level: undefined, locked: false };
  const at: SystemLevel = level ?? "service";
  const rank = { service: 0, team: 1, agent: 2 } as const;
  return { on: false, level: at, locked: rank[at] < rank[editing] };
}

const URL_OK = /^(https?:\/\/|\*\.)?[A-Za-z0-9*.-]+(:\d+)?(\/\S*)?$/;

/** Checks a declared or edited system (WEB-US-32.2). */
export function checkSystem(
  i: { [K in keyof DeclareSystemInput]?: DeclareSystemInput[K] | undefined },
  creating: boolean,
): AppError | undefined {
  if (creating) {
    if (!i.name?.trim()) return invalid("name", "Enter a name");
    if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(i.slug ?? ""))
      return invalid("slug", "Use 3 to 40 lower-case letters, digits and hyphens");
    if (!i.owner?.trim()) return invalid("owner", "Enter the owner");
    if (!i.purpose?.trim()) return invalid("purpose", "Enter the purpose");
  }
  if (
    i.endpoints !== undefined &&
    (i.endpoints.length === 0 || !i.endpoints.every((e) => URL_OK.test(e)))
  )
    return invalid("endpoints", "Enter at least one endpoint, such as api.example.com");
  return undefined;
}

/** External systems of a team and its agents (M2-E). The API decides every state change. */
export class ExternalSystemsUseCases {
  constructor(private readonly port: ExternalSystemsPort) {}

  listTeam(teamId: string, signal?: AbortSignal) {
    return this.port.listTeam(teamId, signal);
  }
  listAgent(teamId: string, agentId: string, signal?: AbortSignal) {
    return this.port.listAgent(teamId, agentId, signal);
  }
  declare(teamId: string, input: DeclareSystemInput) {
    const bad = checkSystem(input, true);
    return bad ? Promise.reject(bad) : this.port.declare(teamId, input);
  }
  updateTeam(teamId: string, ref: SystemRef, input: UpdateSystemInput) {
    const bad = checkSystem(input, false);
    return bad ? Promise.reject(bad) : this.port.updateTeam(teamId, ref, input);
  }
  deleteTeam(teamId: string, ref: SystemRef) {
    return this.port.deleteTeam(teamId, ref);
  }
  setTeamState(teamId: string, ref: SystemRef, enabled: boolean) {
    return this.port.setTeamState(teamId, ref, enabled);
  }
  setAgentState(teamId: string, agentId: string, ref: SystemRef, enabled: boolean) {
    return this.port.setAgentState(teamId, agentId, ref, enabled);
  }
}
