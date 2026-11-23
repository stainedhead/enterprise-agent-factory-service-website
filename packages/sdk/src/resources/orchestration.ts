import type { AfsClient } from "../core/client.js";
import { orchestration as generatedOrchestration } from "../generated/resources/orchestration.js";
import type { TeamOrchestration } from "../generated/schemas.js";

/** One surface of {@link OrchestrationEndpointUrls}: the address when the edge serves it, else `null` with why. */
export interface EndpointUrl {
  /** The effective address (`https://<hostname>/…`), or `null` when the effective level is `off`. */
  readonly url: string | null;
  /** The first reason the surface is off or lowered (for example `tool_not_supported`), when there is one. */
  readonly reason: string | null;
}

/** The effective Web UI and Web API addresses of a team's orchestration agent (WEB-US-46). */
export interface OrchestrationEndpointUrls {
  readonly webUi: EndpointUrl;
  readonly webApi: EndpointUrl;
}

type Surface = Pick<TeamOrchestration["webUi"], "url" | "reasons" | "effective">;

const toUrl = (s: Surface): EndpointUrl => ({
  url: s.effective === "off" ? null : s.url,
  reason: s.url && s.effective !== "off" ? null : (s.reasons[0] ?? null),
});

/**
 * The effective Web UI and Web API URLs of a `TeamOrchestration`, or `null` with the reason (the tool lacks the
 * surface, the team's limit, a kill switch or an unset base domain). Pure; it never calls the API.
 */
export function endpointUrls(
  o: Pick<TeamOrchestration, "webUi" | "webApi">,
): OrchestrationEndpointUrls {
  return { webUi: toUrl(o.webUi), webApi: toUrl(o.webApi) };
}

/**
 * The `orchestration` namespace: every generated operation plus `endpointUrls`.
 * The SDK never calls the edge, never proxies a tool request and never takes a tool key.
 */
export function createOrchestration(core: AfsClient) {
  return { ...generatedOrchestration(core), endpointUrls };
}
