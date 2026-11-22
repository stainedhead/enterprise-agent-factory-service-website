// The configuration values port (M2-V1): namespace values shared by a team's agents, and per-agent values
// that are either their own literal or a reference to the namespace value of the same name. Non-secret only.

export interface ConfigValueRecord {
  readonly name: string;
  /** `literal` is the agent's own value; `namespace` takes the team's value of the same name. */
  readonly source: string;
  readonly value?: string | undefined;
  /** What the agent receives: its own value or the namespace's. */
  readonly resolvedValue?: string | null | undefined;
  /** Ids of the agents that use a namespace value. */
  readonly usedBy: readonly string[];
  readonly version?: number | undefined;
  readonly updatedAt?: string | undefined;
}

export interface ConfigRef {
  readonly name: string;
  readonly version?: number | undefined;
}

export interface AgentConfigInput {
  readonly source: "literal" | "namespace";
  readonly value?: string | undefined;
}

export interface ConfigValuesPort {
  listNamespace(teamId: string, signal?: AbortSignal): Promise<readonly ConfigValueRecord[]>;
  putNamespace(teamId: string, ref: ConfigRef, value: string): Promise<ConfigValueRecord>;
  deleteNamespace(teamId: string, ref: ConfigRef): Promise<void>;
  listAgent(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly ConfigValueRecord[]>;
  putAgent(
    teamId: string,
    agentId: string,
    ref: ConfigRef,
    input: AgentConfigInput,
  ): Promise<ConfigValueRecord>;
  deleteAgent(teamId: string, agentId: string, ref: ConfigRef): Promise<void>;
}
