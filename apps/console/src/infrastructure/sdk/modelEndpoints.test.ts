import { describe, expect, it } from "vitest";
import {
  SdkAdminModelEndpoints,
  SdkInferenceProviders,
  SdkInferenceReports,
  SdkTeamModelEndpoints,
} from "./modelEndpoints.js";
import { fakeApi, json, on } from "./testing.js";

const ep = { id: "mep_1", slug: "azure-openai", version: 3 };
const ADMIN = "/v1/admin/model-endpoints";

describe("SdkAdminModelEndpoints (MEG-WEB-2)", () => {
  it("lists with teams, gets, creates, switches with If-Match and deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", ADMIN, () => json({ items: [ep] })),
      on("GET", `${ADMIN}/mep_1`, () => json(ep)),
      on("POST", ADMIN, () => json(ep, 201)),
      on("PATCH", `${ADMIN}/mep_1`, () => json({ ...ep, enabled: false, version: 4 })),
      on("DELETE", `${ADMIN}/mep_1`, () => new Response(null, { status: 204 })),
    );
    const a = new SdkAdminModelEndpoints(client);
    expect((await a.list(true)).map((e) => e.slug)).toEqual(["azure-openai"]);
    expect(calls[0]?.query.get("includeTeams")).toBe("true");
    expect((await a.get("mep_1")).id).toBe("mep_1");
    await a.create({ slug: "azure-openai" });
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ slug: "azure-openai" });
    expect((await a.setEnabled({ id: "mep_1", version: 3 }, false)).version).toBe(4);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.headers.get("if-match")).toContain("3");
    expect(patch?.body).toEqual({ enabled: false });
    await a.delete({ id: "mep_1", version: 4 });
    expect(calls.find((c) => c.method === "DELETE")?.headers.get("if-match")).toContain("4");
  });

  it("adds a price, lists teams and sends credential values only in the body", async () => {
    const { client, calls } = fakeApi(
      on("POST", `${ADMIN}/mep_1/prices`, () => json({}, 201)),
      on("GET", `${ADMIN}/mep_1/teams`, () => json({ items: [{ teamId: "team_1" }] })),
      on("PUT", `${ADMIN}/mep_1/credentials/team_1`, () =>
        json({ state: "set", rotatedAt: null, scope: "team_1" }),
      ),
      on("POST", `${ADMIN}/mep_1/credentials/shared:rotate`, () =>
        json({ state: "set", rotatedAt: "2026-11-25T00:00:00Z" }),
      ),
      on("PUT", `${ADMIN}/mep_1/federations/team_1`, () => json({ status: "pending" })),
    );
    const a = new SdkAdminModelEndpoints(client);
    await a.createPrice("mep_1", {
      modelName: "chat-large",
      inputUsdPerMtok: "1.25",
      outputUsdPerMtok: "10.00",
      effectiveFrom: "2026-11-25T00:00:00Z",
    });
    expect(calls[0]?.body).toEqual({
      modelName: "chat-large",
      effectiveFrom: "2026-11-25T00:00:00Z",
      inputUsdPerMtok: "1.25",
      outputUsdPerMtok: "10.00",
    });
    expect((await a.teams("mep_1"))[0]?.teamId).toBe("team_1");
    // only state and rotatedAt come back; nothing else of the response is kept
    expect(await a.putCredential("mep_1", "team_1", "cred-one")).toEqual({
      state: "set",
      rotatedAt: null,
    });
    expect((await a.rotateCredential("mep_1", "shared", "cred-two")).rotatedAt).toBe(
      "2026-11-25T00:00:00Z",
    );
    expect(calls.filter((c) => c.path.includes("/credentials/")).map((c) => c.body)).toEqual([
      { value: "cred-one" },
      { value: "cred-two" },
    ]);
    expect(
      calls.every((c) => !c.path.includes("cred-") && !c.query.toString().includes("cred-")),
    ).toBe(true);
    expect((await a.putFederation("mep_1", "team_1", { expectedIssuer: "iss" })).status).toBe(
      "pending",
    );
  });

  it("lists proposals by status, decides with a note and puts gateway settings", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/endpoint-price-proposals", () => json({ items: [] })),
      on("POST", "/v1/admin/endpoint-price-proposals/epp_1:approve", () =>
        json({ id: "epp_1", status: "approved" }),
      ),
      on("POST", "/v1/admin/endpoint-price-proposals/epp_1:reject", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r" }, 403),
      ),
      on("PUT", "/v1/admin/teams/team_1/gateway-settings", () =>
        json({ teamId: "team_1", deployment: "per_namespace", version: 2 }),
      ),
    );
    const a = new SdkAdminModelEndpoints(client);
    await a.proposals("pending");
    expect(calls[0]?.query.get("status")).toBe("pending");
    await a.approve("epp_1", "ok");
    expect(calls[1]?.body).toEqual({ note: "ok" });
    await expect(a.reject("epp_1")).rejects.toMatchObject({ kind: "access-denied" });
    expect(calls[2]?.body).toEqual({});
    const v = { deployment: "per_namespace", mayAddModelEndpoints: true };
    await a.putGatewaySettings("team_1", 7, v);
    await a.putGatewaySettings("team_1", undefined, v);
    const puts = calls.filter((c) => c.method === "PUT");
    expect(puts[0]?.headers.get("if-match")).toContain("7");
    expect(puts[1]?.headers.get("if-match")).toBeNull();
    expect(puts[0]?.body).toEqual(v);
  });
});

describe("SdkInferenceProviders (MEG-WEB-2)", () => {
  it("lists, previews as a dry run and updates without undefined members", async () => {
    const bedrock = { provider: "bedrock", enabled: true, version: 2 };
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/inference-providers", () => json({ items: [bedrock] })),
      on("PATCH", "/v1/admin/inference-providers/bedrock", () => json({ ...bedrock, version: 3 })),
    );
    const p = new SdkInferenceProviders(client);
    expect((await p.list())[0]?.provider).toBe("bedrock");
    await p.impact(
      { provider: "bedrock", version: 2 },
      { enabled: false, reason: "r", fallbackModel: undefined },
    );
    const dry = calls.find((c) => c.method === "PATCH");
    expect(dry?.query.get("dryRun")).toBe("true");
    expect(dry?.body).toEqual({ enabled: false, reason: "r" });
    expect(dry?.headers.get("if-match")).toContain("2");
    await p.update({ provider: "bedrock", version: 2 }, { enabled: true });
    const real = calls.filter((c) => c.method === "PATCH")[1];
    expect(real?.query.get("dryRun")).toBeNull();
    expect(real?.body).toEqual({ enabled: true });
  });
});

describe("SdkTeamModelEndpoints (MEG-WEB-3)", () => {
  it("follows every page and reads the gateway fields of the first", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/team_1/model-endpoints", (r) =>
        r.query.get("nextToken")
          ? json({ items: [{ id: "b" }] })
          : json({
              items: [{ id: "a" }],
              nextToken: "t2",
              gatewayDeployment: "per_namespace",
              mayAddModelEndpoints: true,
            }),
      ),
    );
    const r = await new SdkTeamModelEndpoints(client).list("team_1");
    expect(r.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(r.gatewayDeployment).toBe("per_namespace");
    expect(r.mayAddModelEndpoints).toBe(true);
    expect(calls[1]?.query.get("nextToken")).toBe("t2");
  });

  it("defaults the gateway fields when absent", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/team_1/model-endpoints", () => json({ items: [] })),
    );
    const r = await new SdkTeamModelEndpoints(client).list("team_1");
    expect(r).toEqual({ gatewayDeployment: "shared", mayAddModelEndpoints: false, items: [] });
  });

  it("puts selections, creates, deletes with If-Match and sets a credential", async () => {
    const { client, calls } = fakeApi(
      on("PUT", "/v1/teams/team_1/model-endpoint-selections", (r) => json(r.body)),
      on("POST", "/v1/teams/team_1/model-endpoints", () => json({ id: "mep_t" }, 201)),
      on(
        "DELETE",
        "/v1/teams/team_1/model-endpoints/mep_t",
        () => new Response(null, { status: 204 }),
      ),
      on("PUT", "/v1/teams/team_1/model-endpoints/mep_t/credential", () =>
        json({ state: "set", rotatedAt: null }),
      ),
      on("GET", "/v1/teams/team_1/model-endpoints/mep_t", () => json({ id: "mep_t", version: 1 })),
    );
    const t = new SdkTeamModelEndpoints(client);
    expect(await t.putSelections("team_1", ["a", "b"])).toEqual(["a", "b"]);
    expect((await t.create("team_1", { slug: "coder" })).id).toBe("mep_t");
    await t.delete("team_1", { id: "mep_t", version: 5 });
    expect(calls.find((c) => c.method === "DELETE")?.headers.get("if-match")).toContain("5");
    expect(await t.putCredential("team_1", "mep_t", "v")).toEqual({
      state: "set",
      rotatedAt: null,
    });
    expect(calls.at(-1)?.body).toEqual({ value: "v" });
  });
});

describe("SdkInferenceReports (MEG-WEB-2, -3)", () => {
  const report = {
    range: { from: "2026-11-01", to: "2026-11-25" },
    groupBy: ["route"],
    rows: [],
    totals: { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: "0.00" },
    notes: [],
  };

  it("runs the service report with filters and the team report without teamId", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/reports/inference", () => json(report)),
      on("GET", "/v1/teams/team_1/reports/inference", () => json(report)),
    );
    const r = new SdkInferenceReports(client);
    const data = await r.run(
      { level: "service" },
      {
        range: "mtd",
        groupBy: ["route", "model"],
        route: "bedrock",
        agentId: "agt_1",
        teamId: "team_1",
      },
    );
    expect(data.groupBy).toEqual(["route"]);
    const q = calls[0]?.query;
    expect(q?.get("range")).toBe("mtd");
    expect(q?.get("route")).toBe("bedrock");
    expect(q?.get("agentId")).toBe("agt_1");
    expect(q?.get("teamId")).toBe("team_1");
    expect(q?.getAll("groupBy").join(",")).toContain("route");
    await r.run({ level: "team", teamId: "team_1" }, { teamId: "team_9", groupBy: [] });
    expect(calls[1]?.path).toBe("/v1/teams/team_1/reports/inference");
    expect(calls[1]?.query.get("teamId")).toBeNull();
    expect(calls[1]?.query.get("groupBy")).toBeNull();
  });

  it("exports CSV", async () => {
    const { client, calls } = fakeApi(
      on(
        "GET",
        "/v1/reports/inference",
        () => new Response("route,calls\n", { headers: { "content-type": "text/csv" } }),
      ),
    );
    expect(await new SdkInferenceReports(client).csv({ level: "service" }, {})).toBe(
      "route,calls\n",
    );
    expect(calls[0]?.headers.get("accept") ?? calls[0]?.query.get("format")).toMatch(/csv/);
  });
});
