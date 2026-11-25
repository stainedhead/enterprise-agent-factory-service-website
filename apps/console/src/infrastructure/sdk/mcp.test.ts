import { describe, expect, it } from "vitest";
import { SdkFederatedIdentities, SdkMcpCatalog, SdkMcpUsage, SdkTeamMcp } from "./mcp.js";
import { fakeApi, json, on } from "./testing.js";

const S = "/v1/mcp-servers";
const T = "/v1/teams/team_1/mcp-servers";
const server = { id: "mcp_1", slug: "jira", version: 3, reviewStatus: "approved" };
const cred = {
  scope: "shared",
  state: "set",
  kind: "static",
  scopes: [],
  subject: null,
  rotatedAt: "2026-11-25T00:00:00Z",
  expiresAt: null,
  extra: "dropped",
};
const noContent = () => new Response(null, { status: 204 });

describe("SdkMcpCatalog (MCP-WEB-2)", () => {
  it("lists with filters, gets, creates, imports, updates and deletes with If-Match", async () => {
    const { client, calls } = fakeApi(
      on("GET", S, () => json({ items: [server] })),
      on("GET", `${S}/mcp_1`, () => json(server)),
      on("POST", S, () => json(server, 201)),
      on("POST", `${S}:import`, () => json(server, 201)),
      on("PATCH", `${S}/mcp_1`, () => json({ ...server, version: 4 })),
      on("DELETE", `${S}/mcp_1`, noContent),
    );
    const a = new SdkMcpCatalog(client);
    expect((await a.list({ scope: "enterprise", reviewStatus: "approved" })).length).toBe(1);
    expect(calls[0]?.query.get("scope")).toBe("enterprise");
    expect(calls[0]?.query.get("reviewStatus")).toBe("approved");
    await a.list({});
    expect(calls[1]?.query.has("scope")).toBe(false);
    expect((await a.get("mcp_1")).slug).toBe("jira");
    await a.create({ slug: "jira" });
    await a.importManifest({ name: "io.example/jira" }, "jira");
    expect(calls.at(-1)?.body).toEqual({ manifest: { name: "io.example/jira" }, slug: "jira" });
    await a.importManifest({ name: "x" });
    expect(calls.at(-1)?.body).toEqual({ manifest: { name: "x" } });
    expect((await a.update({ id: "mcp_1", version: 3 }, { purpose: "p" })).version).toBe(4);
    expect(calls.at(-1)?.headers.get("if-match")).toContain("3");
    await a.delete({ id: "mcp_1", version: 4 });
    expect(calls.at(-1)?.headers.get("if-match")).toContain("4");
  });

  it("publishes, retires, suspends, resumes, refreshes and reviews", async () => {
    const { client, calls } = fakeApi(on("POST", `${S}/*`, () => json(server)));
    const a = new SdkMcpCatalog(client);
    await a.publish("mcp_1", "ok");
    await a.publish("mcp_1");
    await a.retire("mcp_1");
    await a.suspend("mcp_1", "incident");
    await a.resume("mcp_1", "fixed");
    await a.refresh("mcp_1");
    await a.review("mcp_1", "approve", {
      note: "fine",
      primitives: [{ primitiveId: "mcpp_1", decision: "block" }],
    });
    await a.review("mcp_1", "reject", { note: "no" });
    await a.review("mcp_1", "request-changes", { note: "docs" });
    expect(calls.map((c) => c.path.split("/").at(-1))).toEqual([
      "mcp_1:publish",
      "mcp_1:publish",
      "mcp_1:retire",
      "mcp_1:suspend",
      "mcp_1:resume",
      "mcp_1:refresh",
      "mcp_1:approve",
      "mcp_1:reject",
      "mcp_1:request-changes",
    ]);
    expect(calls.map((c) => c.body)).toEqual([
      { note: "ok" },
      {},
      {},
      { reason: "incident" },
      { reason: "fixed" },
      undefined,
      { note: "fine", primitives: [{ primitiveId: "mcpp_1", decision: "block" }] },
      { note: "no" },
      { note: "docs" },
    ]);
  });

  it("reads inventory and changes, decides primitives, puts policy and credentials", async () => {
    const prim = { id: "mcpp_1", name: "create_issue", status: "pending_review" };
    const { client, calls } = fakeApi(
      on("GET", `${S}/mcp_1/primitives`, () => json({ items: [prim] })),
      on("GET", `${S}/mcp_1/primitives/mcpp_1/change`, () => json({ primitive: prim, diff: [] })),
      on("POST", `${S}/mcp_1/primitives/*`, () => json(prim)),
      on("PUT", `${S}/mcp_1/policy`, (r) => json({ serverId: "mcp_1", ...(r.body as object) })),
      on("PUT", `${S}/mcp_1/credentials/shared`, () => json(cred)),
    );
    const a = new SdkMcpCatalog(client);
    expect((await a.primitives("mcp_1"))[0]?.name).toBe("create_issue");
    expect((await a.change("mcp_1", "mcpp_1")).diff).toEqual([]);
    await a.decidePrimitive("mcp_1", "mcpp_1", "approve", "seen");
    await a.decidePrimitive("mcp_1", "mcpp_1", "reject");
    expect(calls.slice(2, 4).map((c) => [c.path.split("/").at(-1), c.body])).toEqual([
      ["mcpp_1:approve", { note: "seen" }],
      ["mcpp_1:reject", {}],
    ]);
    await a.putPolicy("mcp_1", [
      { effect: "block", class: "destructive", name: undefined },
      { effect: "allow", name: "search", rateLimitPerMinute: 10 },
    ]);
    expect(calls.at(-1)?.body).toEqual({
      rules: [
        { effect: "block", class: "destructive" },
        { effect: "allow", name: "search", rateLimitPerMinute: 10 },
      ],
    });
    const c = await a.putCredential("mcp_1", "shared", { value: "tok-one" });
    expect(c).toEqual({
      scope: "shared",
      state: "set",
      kind: "static",
      scopes: [],
      subject: null,
      rotatedAt: "2026-11-25T00:00:00Z",
      expiresAt: null,
    });
    expect(JSON.stringify(c)).not.toContain("tok-one");
    await a.putCredential("mcp_1", "shared", { clientId: "cid", clientSecret: "sec-two" });
    expect(calls.filter((x) => x.path.includes("/credentials/")).map((x) => x.body)).toEqual([
      { value: "tok-one" },
      { clientId: "cid", clientSecret: "sec-two" },
    ]);
    expect(
      calls.every((x) => !x.path.includes("tok-") && !x.query.toString().includes("sec-")),
    ).toBe(true);
  });

  it("lists reviews and reads, starts and stops query capture", async () => {
    const capture = { id: "qc_1", reason: "r", until: "2026-12-01T00:00:00Z", stoppedAt: null };
    const { client, calls } = fakeApi(
      on("GET", "/v1/mcp-reviews", () => json({ items: [{ serverId: "mcp_1", kind: "server" }] })),
      on("GET", "/v1/mcp-settings/query-capture", () => json({ capture })),
      on("POST", "/v1/mcp-settings/query-capture:start", () => json(capture)),
      on("POST", "/v1/mcp-settings/query-capture:stop", () => json(capture)),
    );
    const a = new SdkMcpCatalog(client);
    expect((await a.reviews())[0]?.serverId).toBe("mcp_1");
    expect((await a.queryCapture())?.id).toBe("qc_1");
    await a.startCapture(7, "investigate");
    expect(calls.at(-1)?.body).toEqual({ days: 7, reason: "investigate" });
    expect((await a.stopCapture()).id).toBe("qc_1");
  });

  it("maps API errors to application errors", async () => {
    const { client } = fakeApi(
      on("GET", `${S}/mcp_9`, () =>
        json({ code: "AccessDenied", message: "no", requestId: "r1" }, 403),
      ),
    );
    await expect(new SdkMcpCatalog(client).get("mcp_9")).rejects.toMatchObject({
      kind: "access-denied",
      requestId: "r1",
    });
  });
});

describe("SdkTeamMcp (MCP-WEB-5)", () => {
  const ts = { server, enabled: true, mode: "full", state: "on", managed: "enterprise" };

  it("lists, gets, switches, creates, submits, reviews, refreshes and deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", T, () => json({ items: [ts] })),
      on("GET", `${T}/mcp_1`, () => json(ts)),
      on("PUT", `${T}/mcp_1`, (r) => json({ ...ts, ...(r.body as object) })),
      on("POST", T, () => json(server, 201)),
      on("POST", `${T}/*`, () => json(server)),
      on("DELETE", `${T}/mcp_1`, noContent),
    );
    const a = new SdkTeamMcp(client);
    expect((await a.list("team_1"))[0]?.state).toBe("on");
    expect((await a.get("team_1", "mcp_1")).managed).toBe("enterprise");
    expect((await a.put("team_1", "mcp_1", true, "read_only")).mode).toBe("read_only");
    await a.put("team_1", "mcp_1", false);
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([
      { enabled: true, mode: "read_only" },
      { enabled: false },
    ]);
    await a.create("team_1", { slug: "wiki" });
    await a.submit("team_1", "mcp_1");
    await a.review("team_1", "mcp_1", "approve", { note: "ok" });
    await a.review("team_1", "mcp_1", "reject", { note: "no" });
    await a.refresh("team_1", "mcp_1");
    expect(
      calls.filter((c) => c.method === "POST" && c.path !== T).map((c) => c.path.split("/").at(-1)),
    ).toEqual(["mcp_1:submit", "mcp_1:approve", "mcp_1:reject", "mcp_1:refresh"]);
    await a.delete("team_1", { id: "mcp_1", version: 3 });
    expect(calls.at(-1)?.headers.get("if-match")).toContain("3");
  });

  it("decides primitives, puts policy and credentials, connects OAuth and tests federation", async () => {
    const { client, calls } = fakeApi(
      on("GET", `${T}/mcp_1/primitives`, () => json({ items: [{ id: "mcpp_1" }] })),
      on("POST", `${T}/mcp_1/primitives/*`, () => json({ id: "mcpp_1" })),
      on("PUT", `${T}/mcp_1/policy`, () => json({ rules: [] })),
      on("PUT", `${T}/mcp_1/credential`, () => json(cred)),
      on("POST", `${T}/mcp_1/oauth:start`, () =>
        json({
          authorizationUrl: "https://idp.example/authorize",
          expiresAt: "2026-11-25T00:10:00Z",
          state: "opaque-state",
        }),
      ),
      on("POST", `${T}/mcp_1/oauth:disconnect`, () => json({ ...cred, state: "missing" })),
      on("POST", `${T}/mcp_1/federation:test`, () => json({ ...ts, federationState: "ok" })),
      on("GET", "/v1/teams/team_1/agents/agt_1/mcp", () =>
        json({ access: "all", mode: "search", env: ["AFS_MCP_URL"], servers: [] }),
      ),
    );
    const a = new SdkTeamMcp(client);
    expect((await a.primitives("team_1", "mcp_1")).length).toBe(1);
    await a.decidePrimitive("team_1", "mcp_1", "mcpp_1", "approve", "ok");
    await a.decidePrimitive("team_1", "mcp_1", "mcpp_1", "reject");
    expect(calls.slice(1, 3).map((c) => c.path.split("/").at(-1))).toEqual([
      "mcpp_1:approve",
      "mcpp_1:reject",
    ]);
    await a.putPolicy("team_1", "mcp_1", [{ effect: "block", name: "delete_page" }]);
    expect(calls.at(-1)?.body).toEqual({ rules: [{ effect: "block", name: "delete_page" }] });
    expect((await a.putCredential("team_1", "mcp_1", { value: "v-1" })).state).toBe("set");
    expect(calls.at(-1)?.body).toEqual({ value: "v-1" });
    // the single-use state is never handed to the console
    expect(await a.startOAuth("team_1", "mcp_1")).toEqual({
      authorizationUrl: "https://idp.example/authorize",
      expiresAt: "2026-11-25T00:10:00Z",
    });
    expect((await a.disconnectOAuth("team_1", "mcp_1")).state).toBe("missing");
    expect((await a.testFederation("team_1", "mcp_1")).federationState).toBe("ok");
    expect((await a.effective("team_1", "agt_1")).env).toEqual(["AFS_MCP_URL"]);
  });
});

describe("SdkMcpUsage (MCP-WEB-8)", () => {
  const report = {
    from: "2026-11-01T00:00:00Z",
    to: "2026-11-25T00:00:00Z",
    view: "unused",
    groupBy: "server",
    windowDays: 30,
    rows: [{ key: "mcp_1", label: "jira", calls: 0, errors: 0, refusals: 0 }],
  };

  it("runs the service and team report, passing the window, and returns CSV", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/reports/mcp", (r) =>
        r.headers.get("accept")?.includes("text/csv")
          ? new Response("key,calls\nmcp_1,0\n", { headers: { "content-type": "text/csv" } })
          : json(report),
      ),
      on("GET", "/v1/teams/team_1/reports/mcp", () => json({ ...report, windowDays: undefined })),
    );
    const a = new SdkMcpUsage(client);
    const d = await a.run(
      { level: "service" },
      { view: "unused", groupBy: "server", windowDays: 30 },
    );
    expect(d).toEqual(report);
    expect(calls[0]?.query.get("window")).toBe("30");
    const t = await a.run({ level: "team", teamId: "team_1" }, { view: "usage", groupBy: "agent" });
    expect(t.windowDays).toBeUndefined();
    expect(calls[1]?.query.has("window")).toBe(false);
    expect(calls[1]?.query.get("groupBy")).toBe("agent");
    expect(await a.csv({ level: "service" }, { view: "usage", groupBy: "server" })).toContain(
      "mcp_1",
    );
  });
});

describe("SdkFederatedIdentities (MCP-WEB-9)", () => {
  const P = "/v1/teams/team_1/agents/agt_1/federated-identities";

  it("lists, puts and deletes with If-Match", async () => {
    const fi = { name: "jira", audience: "https://jira.example", version: 2 };
    const { client, calls } = fakeApi(
      on("GET", P, () => json({ items: [fi] })),
      on("PUT", `${P}/jira`, () => json(fi)),
      on("DELETE", `${P}/jira`, noContent),
    );
    const a = new SdkFederatedIdentities(client);
    expect((await a.list("team_1", "agt_1"))[0]?.name).toBe("jira");
    await a.put("team_1", "agt_1", "jira", {
      audience: "https://jira.example",
      expirationSeconds: 900,
    });
    await a.put("team_1", "agt_1", "jira", { audience: "https://jira.example" });
    expect(calls.filter((c) => c.method === "PUT").map((c) => c.body)).toEqual([
      { audience: "https://jira.example", expirationSeconds: 900 },
      { audience: "https://jira.example" },
    ]);
    await a.delete("team_1", "agt_1", { name: "jira", version: 2 });
    expect(calls.at(-1)?.headers.get("if-match")).toContain("2");
  });
});
