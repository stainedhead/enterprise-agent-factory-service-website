import type { EffectiveMcp, EffectiveMcpPrimitive } from "../generated/schemas.js";

const SLUG = /^[a-z][a-z0-9-]{1,30}$/;

/** The environment variables and file every agent with an effective MCP server receives (gateway contract 13.5). */
export const MCP_ENV = {
  /** `AFS_GATEWAY_URL` + `/mcp`: the aggregated endpoint. */
  url: "AFS_MCP_URL",
  /** `search` or `full`. */
  mode: "AFS_MCP_MODE",
  /** The effective server slugs, comma-separated and sorted. */
  servers: "AFS_MCP_SERVERS",
  /** The MCP host configuration file (`mcpServers` block plus the AFS server list). */
  configFile: "/etc/afs/mcp.json",
} as const;

/** Whether `slug` is a valid MCP server slug: a DNS label of 2 to 31 characters, and not the reserved `afs`. */
export function isMcpSlug(slug: string): boolean {
  return SLUG.test(slug) && slug !== "afs";
}

/**
 * The variable that carries one server's URL: `AFS_MCP_<SERVER>_URL`, with the slug upper-cased and `-` turned into
 * `_` (`eng-handbook` → `AFS_MCP_ENG_HANDBOOK_URL`). Pure; gateway contract 13.5.
 */
export function mcpServerUrlEnv(slug: string): string {
  return `AFS_MCP_${slug.toUpperCase().replace(/-/g, "_")}_URL`;
}

/**
 * The qualified name of a primitive on the aggregated endpoint: `<server>__<name>`, as `full` mode lists it and
 * `afs_call` takes it.
 */
export function qualifiedMcpName(server: string, name: string): string {
  return `${server}__${name}`;
}

/** The effective primitives of one server, split by whether they are allowed and by the level that decided each. */
export interface EffectiveToolGroup {
  /** The server id. */
  readonly serverId: string;
  /** The server slug, which is also its route `/mcp/<slug>`. */
  readonly slug: string;
  /** `enterprise` or `team`. */
  readonly scope: string;
  /** The team mode, `full` or `read_only`. */
  readonly mode: string;
  /** The gateway path for this server. */
  readonly url: string;
  /** The primitives the agent may use. */
  readonly allowed: readonly EffectiveMcpPrimitive[];
  /** The primitives refused, each with `level` and `reason`. */
  readonly refused: readonly EffectiveMcpPrimitive[];
  /** Refused primitives counted by the level that decided (`service`, `team`, `agent`, `pool`, or `review`). */
  readonly refusedBy: Readonly<Record<string, number>>;
}

/**
 * Groups the result of `agents.mcp()` or `pools.mcp()` by server, sorted by slug, with allowed and refused
 * primitives apart and refusals counted by deciding level (a refusal without a level is a held review). Pure.
 */
export function effectiveTools(effective: EffectiveMcp): EffectiveToolGroup[] {
  return [...effective.servers]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((s) => {
      const allowed = s.primitives.filter((p) => p.allowed);
      const refused = s.primitives.filter((p) => !p.allowed);
      const refusedBy: Record<string, number> = {};
      for (const p of refused) {
        const level = p.level ?? "review";
        refusedBy[level] = (refusedBy[level] ?? 0) + 1;
      }
      return {
        serverId: s.serverId,
        slug: s.slug,
        scope: s.scope,
        mode: s.mode,
        url: s.url,
        allowed,
        refused,
        refusedBy,
      };
    });
}
