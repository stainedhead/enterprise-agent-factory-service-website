import type { AfsClient } from "../core/client.js";
import type { CallOptions } from "../core/types.js";
import { collaboration as generatedCollaboration } from "../generated/resources/collaboration.js";

/** The public addresses of a team's Paperclip, each `null` unless the edge serves that surface (SDK-14). */
export interface CollaborationEndpointUrl {
  /** The web UI address when the web UI is effective, else `null`. */
  readonly webUi: string | null;
  /** The REST API address when the REST API is effective, else `null`. */
  readonly restApi: string | null;
  /** The team's collaboration hostname, or `null` when none is configured. */
  readonly hostname: string | null;
}

/**
 * The `collaboration` namespace: every generated operation plus `endpointUrl`.
 * The SDK never calls the edge, never proxies a Paperclip request and never takes a Paperclip key.
 */
export function createCollaboration(core: AfsClient) {
  const g = generatedCollaboration(core);
  return {
    ...g,
    /** One `GetTeamCollaboration` call; a URL is returned only when that surface is effective. */
    async endpointUrl(teamId: string, opts?: CallOptions): Promise<CollaborationEndpointUrl> {
      const c = await g.get(teamId, opts);
      return {
        webUi: c.effective.webUi ? c.webUiUrl : null,
        restApi: c.effective.restApi ? c.restApiUrl : null,
        hostname: c.hostname,
      };
    },
  };
}
