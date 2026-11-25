// The external-systems port for a team and its agents (M2-E, T9 and T10): `ListTeamExternalSystems`,
// `DeclareTeamExternalSystem`, `UpdateTeamExternalSystem`, `DeleteTeamExternalSystem`,
// `SetTeamExternalSystemState`, `ListAgentExternalSystems`, `SetAgentExternalSystemState`.

export interface ExternalSystemRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly description?: string | undefined;
  readonly docsUrl?: string | undefined;
  readonly owner?: string | undefined;
  readonly purpose?: string | undefined;
  readonly endpoints: readonly string[];
  /** The service-level switch (catalog systems) or the system's own switch (team-declared ones). */
  readonly enabled: boolean;
  readonly builtin: boolean;
  /** `service` for a catalog system, `team` for one a team declared. */
  readonly scope: string;
  /** The level at which the system is off for this team or agent, if it is. */
  readonly disabledAt?: string | null | undefined;
  readonly teamState?: string | undefined;
  readonly unmetered: boolean;
  readonly version?: number | undefined;
  /** 1.6.0, category `mcp`: the MCP server whose host covers this system; it cannot be switched on then. */
  readonly governedBy?: string | null | undefined;
}

export interface DeclareSystemInput {
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly owner: string;
  readonly purpose: string;
  readonly endpoints: readonly string[];
  readonly description?: string | undefined;
  readonly docsUrl?: string | undefined;
}

export interface UpdateSystemInput {
  readonly name?: string | undefined;
  readonly owner?: string | undefined;
  readonly purpose?: string | undefined;
  readonly endpoints?: readonly string[] | undefined;
  readonly description?: string | undefined;
  readonly docsUrl?: string | undefined;
}

export interface SystemRef {
  readonly id: string;
  readonly version?: number | undefined;
}

export interface ExternalSystemsPort {
  listTeam(teamId: string, signal?: AbortSignal): Promise<readonly ExternalSystemRecord[]>;
  declare(teamId: string, input: DeclareSystemInput): Promise<ExternalSystemRecord>;
  updateTeam(
    teamId: string,
    ref: SystemRef,
    input: UpdateSystemInput,
  ): Promise<ExternalSystemRecord>;
  deleteTeam(teamId: string, ref: SystemRef): Promise<void>;
  setTeamState(teamId: string, ref: SystemRef, enabled: boolean): Promise<ExternalSystemRecord>;
  listAgent(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly ExternalSystemRecord[]>;
  setAgentState(
    teamId: string,
    agentId: string,
    ref: SystemRef,
    enabled: boolean,
  ): Promise<ExternalSystemRecord>;
}
