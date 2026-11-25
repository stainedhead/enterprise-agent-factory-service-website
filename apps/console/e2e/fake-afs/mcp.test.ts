// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { AGENT_IDS } from "./fixtures/agents.js";
import { TEAMS } from "./fixtures/core.js";
import { MCP_IDS, resetMcp } from "./fixtures/mcp.js";
import { FakeAfs } from "./server.js";

const IDP = "http://127.0.0.1:4401";
const T = TEAMS[0].id;
const A = AGENT_IDS[0];
let api: FakeAfs;
const call = async (
  user: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) => {
  const r = await api.handle(
    new Request(`http://api.test${path}`, {
      method,
      headers: {
        origin: "http://console.test",
        authorization: `Bearer at.${user}.1`,
        "content-type": "application/json",
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
  );
  const text = await r.text();
  return { status: r.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
};

describe("fake MCP fixtures (contract 1.6.0)", () => {
  beforeEach(() => {
    resetMcp();
    api = new FakeAfs({ idpIssuer: IDP });
  });

  it("answers every MCP read within the contract", async () => {
    const reads: [string, string][] = [
      ["svc-admin", "/v1/mcp-servers"],
      ["svc-admin", "/v1/mcp-servers?scope=team"],
      ["svc-admin", "/v1/mcp-servers?scope=all"],
      ["svc-admin", `/v1/mcp-servers/${MCP_IDS.github}`],
      ["svc-admin", `/v1/mcp-servers/${MCP_IDS.github}/primitives`],
      ["sec-op", "/v1/mcp-reviews"],
      ["svc-admin", "/v1/mcp-settings/query-capture"],
      ["svc-admin", "/v1/mcp-events"],
      ["team-admin", `/v1/teams/${T}/mcp-servers`],
      ["team-admin", `/v1/teams/${T}/mcp-servers/${MCP_IDS.vendorRisk}`],
      ["team-admin", `/v1/teams/${T}/mcp-servers/${MCP_IDS.ledger}/primitives`],
      ["team-admin", `/v1/teams/${T}/mcp-events`],
      ["team-admin", `/v1/teams/${T}/agents/${A}/mcp`],
      ["team-admin", `/v1/teams/${T}/agents/${A}/federated-identities`],
    ];
    for (const view of ["usage", "unused", "refusals", "discovery", "adoption"])
      for (const groupBy of ["server", "primitive", "team", "agent", "day"]) {
        reads.push(["svc-admin", `/v1/reports/mcp?view=${view}&groupBy=${groupBy}&window=30`]);
        reads.push(["team-admin", `/v1/teams/${T}/reports/mcp?view=${view}&groupBy=${groupBy}`]);
      }
    for (const [user, path] of reads) {
      const r = await call(user, "GET", path);
      expect([path, r.status, r.body]).toEqual([path, 200, expect.anything()]);
    }
    const prims = await call("svc-admin", "GET", `/v1/mcp-servers/${MCP_IDS.github}/primitives`);
    const held = (prims.body.items as { id: string; status: string }[]).find(
      (p) => p.status === "pending_review",
    );
    const change = await call(
      "svc-admin",
      "GET",
      `/v1/mcp-servers/${MCP_IDS.github}/primitives/${held?.id}/change`,
    );
    expect(change.status).toBe(200);
  });

  it("queues the pending team server and the held definition for review", async () => {
    const r = await call("sec-op", "GET", "/v1/mcp-reviews");
    const items = r.body.items as { kind: string; slug: string }[];
    expect(items.map((i) => `${i.kind}:${i.slug}`)).toEqual([
      "server:vendor-risk-api",
      "primitive:github",
    ]);
  });

  it("approves a server with a block, requires a note, and drains the queue", async () => {
    const path = `/v1/mcp-servers/${MCP_IDS.vendorRisk}:approve`;
    expect((await call("sec-op", "POST", path, {})).status).toBe(400);
    const prims = await call(
      "svc-admin",
      "GET",
      `/v1/mcp-servers/${MCP_IDS.vendorRisk}/primitives`,
    );
    const flag = (prims.body.items as { id: string; name: string }[]).find(
      (p) => p.name === "flag_vendor",
    );
    const r = await call("sec-op", "POST", path, {
      note: "Checked with the vendor team",
      primitives: [{ primitiveId: flag?.id, decision: "block" }],
    });
    expect(r.status).toBe(200);
    expect(r.body.reviewStatus).toBe("approved");
    const after = await call(
      "svc-admin",
      "GET",
      `/v1/mcp-servers/${MCP_IDS.vendorRisk}/primitives`,
    );
    expect((after.body.items as { status: string }[]).map((p) => p.status)).toEqual([
      "approved",
      "blocked",
    ]);
  });

  it("switches a server on for a team, sets a credential as metadata only, and connects OAuth", async () => {
    const on = await call("team-admin", "PUT", `/v1/teams/${T}/mcp-servers/${MCP_IDS.handbook}`, {
      enabled: true,
      mode: "read_only",
    });
    expect([on.status, on.body.state, on.body.mode]).toEqual([200, "on", "read_only"]);
    const cred = await call(
      "team-admin",
      "PUT",
      `/v1/teams/${T}/mcp-servers/${MCP_IDS.vendorRisk}/credential`,
      { value: "fake-sentinel-value" },
    );
    expect(cred.status).toBe(200);
    expect(JSON.stringify(cred.body)).not.toContain("fake-sentinel-value");
    const start = await call(
      "team-admin",
      "POST",
      `/v1/teams/${T}/mcp-servers/${MCP_IDS.github}/oauth:start`,
    );
    expect(String(start.body.authorizationUrl)).toMatch(/^https:\/\//);
    const test = await call(
      "team-admin",
      "POST",
      `/v1/teams/${T}/mcp-servers/${MCP_IDS.handbook}/federation:test`,
    );
    expect([test.status, test.body.federationState]).toEqual([202, "ok"]);
  });

  it("registers and submits a team server, and refuses a team that may not add servers", async () => {
    const body = {
      slug: "risk-notes",
      displayName: "Risk notes",
      url: "https://notes.example.test/mcp",
      transport: "streamable_http",
      location: "external",
      authKind: "none",
      dataClassification: "internal",
      purpose: "Notes",
    };
    const r = await call("team-admin", "POST", `/v1/teams/${T}/mcp-servers`, body, {
      "idempotency-key": "k1",
    });
    expect(r.status).toBe(201);
    const sub = await call(
      "team-admin",
      "POST",
      `/v1/teams/${T}/mcp-servers/${String(r.body.id)}:submit`,
    );
    expect([sub.status, sub.body.reviewStatus]).toEqual([200, "pending_review"]);
    const denied = await call("svc-admin", "POST", `/v1/teams/${TEAMS[1].id}/mcp-servers`, body);
    expect(denied.status).toBe(403);
  });

  it("puts and removes an agent's federated identity", async () => {
    const path = `/v1/teams/${T}/agents/${A}/federated-identities/okta-app`;
    const put = await call("team-admin", "PUT", path, {
      audience: "api://okta-app",
      expirationSeconds: 900,
    });
    expect([put.status, put.body.envVar]).toEqual([200, "AFS_FEDERATED_TOKEN_FILE_OKTA_APP"]);
    expect(
      (await call("team-admin", "DELETE", path, undefined, { "if-match": '"1"' })).status,
    ).toBe(204);
  });

  it("opens and stops a query capture window", async () => {
    const start = await call("svc-admin", "POST", "/v1/mcp-settings/query-capture:start", {
      days: 2,
      reason: "Tune search ranking",
    });
    expect(start.status).toBe(201);
    const stop = await call("svc-admin", "POST", "/v1/mcp-settings/query-capture:stop");
    expect(stop.status).toBe(200);
  });
});
