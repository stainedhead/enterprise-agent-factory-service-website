import { describe, expect, it } from "vitest";
import { apiKey } from "../core/auth.js";
import { AfsClient } from "../core/client.js";
import { McpReason } from "../core/reasons.js";
import { createAfs } from "../generated/index.js";
import type { EffectiveMcp } from "../generated/schemas.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { effectiveTools, isMcpSlug, MCP_ENV, mcpServerUrlEnv, qualifiedMcpName } from "./mcp.js";
import { createReports } from "./reports.js";

const client = (f: ReturnType<typeof fakeFetch>) =>
  new AfsClient({
    endpoint: "https://x",
    fetch: f.fetch,
    auth: apiKey("afsk_k"),
    retry: { sleep: async () => {} },
  });

describe("MCP names (gateway contract 13.5)", () => {
  it.each([
    ["github", true],
    ["eng-handbook", true],
    ["afs", false],
    ["a", false],
    ["1github", false],
    ["Git", false],
    ["x".repeat(32), false],
  ])("isMcpSlug(%s) is %s", (slug, ok) => {
    expect(isMcpSlug(slug)).toBe(ok);
  });
  it("names the per-server URL variable in upper snake case", () => {
    expect(mcpServerUrlEnv("github")).toBe("AFS_MCP_GITHUB_URL");
    expect(mcpServerUrlEnv("ledger-schema")).toBe("AFS_MCP_LEDGER_SCHEMA_URL");
  });
  it("qualifies a primitive with its server and two underscores", () => {
    expect(qualifiedMcpName("github", "create_pull_request")).toBe("github__create_pull_request");
  });
  it("names the aggregated variables and the config file", () => {
    expect(MCP_ENV).toEqual({
      url: "AFS_MCP_URL",
      mode: "AFS_MCP_MODE",
      servers: "AFS_MCP_SERVERS",
      configFile: "/etc/afs/mcp.json",
    });
  });
});

describe("effectiveTools (MCP-SDK-1)", () => {
  const eff: EffectiveMcp = {
    access: "selected",
    mode: "search",
    subjectKind: "agent",
    subjectId: "agt_1",
    env: ["AFS_MCP_URL"],
    servers: [
      {
        serverId: "mcp_2",
        slug: "github",
        scope: "enterprise",
        mode: "full",
        url: "/mcp/github",
        primitives: [
          { name: "search_code", kind: "tool", allowed: true, level: null, reason: null },
          {
            name: "merge_pull_request",
            kind: "tool",
            allowed: false,
            level: "agent",
            reason: "primitive_blocked_agent",
          },
          {
            name: "delete_repo",
            kind: "tool",
            allowed: false,
            level: "service",
            reason: "primitive_blocked_service",
          },
          {
            name: "new_tool",
            kind: "tool",
            allowed: false,
            level: null,
            reason: "primitive_pending_review",
          },
        ],
      },
      {
        serverId: "mcp_1",
        slug: "aws-docs",
        scope: "enterprise",
        mode: "full",
        url: "/mcp/aws-docs",
        primitives: [],
      },
    ],
  };
  it("sorts servers by slug and counts refusals by the deciding level", () => {
    const g = effectiveTools(eff);
    expect(g.map((x) => x.slug)).toEqual(["aws-docs", "github"]);
    const gh = g[1];
    expect(gh?.allowed.map((p) => p.name)).toEqual(["search_code"]);
    expect(gh?.refused).toHaveLength(3);
    expect(gh?.refusedBy).toEqual({ agent: 1, service: 1, review: 1 });
    expect(g[0]?.refusedBy).toEqual({});
  });
});

describe("MCP usage reports", () => {
  const report = {
    from: "2026-10-26T00:00:00Z",
    to: "2026-11-25T00:00:00Z",
    groupBy: "server",
    view: "usage",
    rows: [{ key: "mcp_1", label: "github", calls: 3, errors: 0, refusals: 1 }],
  };
  it("passes the view, grouping and window to the service and team reports", async () => {
    const f = fakeFetch()
      .on("GET /v1/reports/mcp", { body: report })
      .on("GET /v1/teams/team_1/reports/mcp", { body: report });
    const r = createReports(client(f));
    const svc = await r.mcpUsage({ view: "adoption", groupBy: "team" });
    await r.teamMcpUsage("team_1", { view: "unused", window: 30 });
    await r.mcpUsage();
    expect(svc.rows[0]?.label).toBe("github");
    expect(f.requests[0]?.query.get("view")).toBe("adoption");
    expect(f.requests[0]?.query.get("groupBy")).toBe("team");
    expect(f.requests[1]?.path).toBe("/v1/teams/team_1/reports/mcp");
    expect(f.requests[1]?.query.get("window")).toBe("30");
    expect(f.requests[2]?.query.toString()).toBe("");
  });
  it("returns the CSV the API sends", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/reports/mcp", {
      text: "server,calls\r\ngithub,3\r\n",
      headers: { "Content-Type": "text/csv" },
    });
    const csv = await createReports(client(f)).teamMcpUsage("team_1").asCsv();
    expect(csv).toBe("server,calls\r\ngithub,3\r\n");
  });
});

describe("MCP credentials are write-only", () => {
  it("sends the value once and returns metadata only", async () => {
    const f = fakeFetch().on("PUT /v1/teams/team_1/mcp-servers/mcp_1/credential", {
      body: { scope: "team_1", scopes: [], state: "set", kind: "static" },
    });
    const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });
    const cred = await afs.teams.mcpServers.putCredential(
      "team_1",
      "mcp_1",
      { value: "s3cr3t" },
      { ifMatch: false },
    );
    expect(cred).not.toHaveProperty("value");
    expect(JSON.stringify(cred)).not.toContain("s3cr3t");
  });
  it("defines the refusal reasons in the gateway's order", () => {
    expect(
      [
        McpReason.ServerNotPublished,
        McpReason.ServerSuspended,
        McpReason.ServerNotEnabledForTeam,
        McpReason.ServerNotEnabledForAgent,
        McpReason.PrimitiveBlockedService,
        McpReason.PrimitiveBlockedTeam,
        McpReason.PrimitiveBlockedAgent,
        McpReason.PrimitivePendingReview,
      ].join(" "),
    ).toBe(
      "server_not_published server_suspended server_not_enabled_for_team server_not_enabled_for_agent primitive_blocked_service primitive_blocked_team primitive_blocked_agent primitive_pending_review",
    );
  });
});
