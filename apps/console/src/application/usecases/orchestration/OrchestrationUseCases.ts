import {
  aboveLimit,
  EXPOSURES,
  isExposure,
  type Surface,
  toolLabel,
} from "../../../domain/orchestration.js";
import { AppError } from "../../errors.js";
import type {
  EndpointsPage,
  EndpointsQuery,
  OrchestrationPort,
  OrchestrationRecord,
  PutOrchestrationInput,
} from "../../ports/orchestration.js";

export const AGENT_PENDING = "orchestration_agent_pending";

/** True for the answer of a 1.0.1 team the backfill has not reached: "Orchestration agent being created". */
export const isAgentPending = (e: unknown): boolean =>
  e instanceof AppError &&
  (e.kind === "not-found" || e.kind === "conflict") &&
  e.reason === AGENT_PENDING;

const invalid = (fields: Record<string, string>, reason?: string) =>
  new AppError({
    kind: "validation",
    message: "The change was not saved",
    fields,
    ...(reason ? { reason } : {}),
  });

const FIELD: Record<Surface, "webUi" | "webApi"> = { webUi: "webUi", webApi: "webApi" };

/** The orchestration area: load the resource, put the exposure levels, change the tool, list endpoints. */
export class OrchestrationUseCases {
  constructor(private readonly port: OrchestrationPort) {}

  get(teamId: string, signal?: AbortSignal): Promise<OrchestrationRecord> {
    return this.port.get(teamId, signal);
  }

  /**
   * Sends both surfaces with the version the page was showing. A level above the team's limit or on a surface the
   * tool lacks is refused here with the API's reasons, so the API is only asked with a value it can accept.
   */
  put(
    teamId: string,
    current: OrchestrationRecord,
    input: PutOrchestrationInput,
  ): Promise<OrchestrationRecord> {
    const errors: Record<string, string> = {};
    for (const s of ["webUi", "webApi"] as const) {
      const level = input[FIELD[s]];
      if (!isExposure(level)) {
        errors[`${s}.exposure`] = `Choose one of ${EXPOSURES.join(", ")}`;
        continue;
      }
      if (level !== "off" && !current[s].supported)
        errors[`${s}.exposure`] = "surface_not_supported_by_tool";
      else if (aboveLimit(level, current.limit)) errors[`${s}.exposure`] = "exposure_above_limit";
    }
    if (Object.keys(errors).length > 0) return Promise.reject(invalid(errors));
    return this.port.put(teamId, { version: current.version }, input);
  }

  /**
   * *Change tool*: the person types the team slug first (ORC-11); the API does not ask for it. A same tool is
   * refused here as `tool_unchanged`.
   */
  changeTool(
    teamId: string,
    current: Pick<OrchestrationRecord, "tool">,
    tool: string,
    typed: string,
    slug: string,
  ): Promise<OrchestrationRecord> {
    if (typed.trim() !== slug)
      return Promise.reject(invalid({ confirm: `Type ${slug} to confirm` }));
    if (tool === current.tool)
      return Promise.reject(
        invalid({ tool: `The team already uses ${toolLabel(tool)}` }, "tool_unchanged"),
      );
    return this.port.changeTool(teamId, tool);
  }

  listEndpoints(query: EndpointsQuery, signal?: AbortSignal): Promise<EndpointsPage> {
    return this.port.listEndpoints(query, signal);
  }

  endpointsCsv(query: EndpointsQuery): Promise<string> {
    return this.port.endpointsCsv(query);
  }
}
