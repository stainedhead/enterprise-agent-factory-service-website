// The orchestration port (WEB-US-46..48, API contract 4.4d): the team's orchestration resource (the tool, the
// two surfaces and their exposure), changing the tool, and the service-wide list of endpoints outside the
// cluster. The harness and the runtime template never appear here (ORC-6). Nothing carries a tool key,
// a secret value or tool content.
import type { ConditionRecord } from "./collaboration.js";

export interface SurfaceRecord {
  /** From the tool's profile; `false` renders "N/A for <tool>". */
  readonly supported: boolean;
  /** What the team chose. */
  readonly exposure: string;
  /** What the edge honours. */
  readonly effective: string;
  readonly reasons: readonly string[];
  /** Of the effective level; `null` when off. */
  readonly hostname: string | null;
  readonly url: string | null;
}

export interface OrchestrationRecord {
  readonly teamId: string;
  readonly agentId: string;
  readonly agentName: string;
  readonly phase: string;
  readonly tool: string;
  readonly toolVersion: string | null;
  readonly registrationMode: string;
  /** The team's `maxCollaborationExposure`. */
  readonly limit: string;
  readonly webUi: SurfaceRecord;
  readonly webApi: SurfaceRecord;
  readonly connectedAgents: number;
  readonly unmanagedToolAgents: readonly string[];
  readonly version: number;
  readonly generation: number;
  readonly observedGeneration: number;
  readonly conditions: readonly ConditionRecord[];
}

export interface PutOrchestrationInput {
  readonly webUi: string;
  readonly webApi: string;
  /** Omitted keeps the current mode. */
  readonly registrationMode?: string | undefined;
}

export interface OrchestrationEndpointRecord {
  readonly teamId: string;
  readonly slug: string;
  readonly teamState: string;
  readonly agentId: string;
  readonly tool: string;
  readonly surface: string;
  readonly exposure: string;
  readonly effective: string;
  readonly reasons: readonly string[];
  readonly limit: string;
  readonly hostname: string | null;
  readonly phase: string;
  readonly lastAccessAt?: string | null | undefined;
}

export interface MigrationRecord {
  readonly state: string;
  readonly teamsTotal: number;
  readonly teamsWithOrchestration: number;
  readonly teamsPending: number;
  readonly blocked: readonly { readonly teamId: string; readonly reason: string }[];
}

export interface EndpointsQuery {
  readonly exposure?: string | undefined;
  readonly tool?: string | undefined;
  readonly teamId?: string | undefined;
  readonly state?: string | undefined;
  readonly maxResults?: number | undefined;
  readonly nextToken?: string | undefined;
}

export interface EndpointsPage {
  readonly items: readonly OrchestrationEndpointRecord[];
  readonly nextToken?: string | undefined;
  readonly migration?: MigrationRecord | undefined;
}

export interface OrchestrationPort {
  /** A team the backfill has not reached answers `not-found` with reason `orchestration_agent_pending`. */
  get(teamId: string, signal?: AbortSignal): Promise<OrchestrationRecord>;
  put(
    teamId: string,
    ref: { readonly version: number },
    input: PutOrchestrationInput,
  ): Promise<OrchestrationRecord>;
  changeTool(teamId: string, tool: string): Promise<OrchestrationRecord>;
  listEndpoints(query: EndpointsQuery, signal?: AbortSignal): Promise<EndpointsPage>;
  endpointsCsv(query: EndpointsQuery): Promise<string>;
}
