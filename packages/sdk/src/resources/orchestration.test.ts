import { describe, expect, it } from "vitest";
import { apiKey } from "../core/auth.js";
import { AfsClient } from "../core/client.js";
import { metaOf } from "../core/types.js";
import { createAfs } from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { createOrchestration, endpointUrls } from "./orchestration.js";

const surface = (over: Record<string, unknown> = {}) => ({
  supported: true,
  exposure: "private",
  effective: "private",
  reasons: [] as string[],
  hostname: "payments.collab.corp.example.com",
  url: "https://payments.collab.corp.example.com/",
  ...over,
});
const resource = (over: Record<string, unknown> = {}) => ({
  teamId: "team_1",
  agentId: "agt_1",
  agentName: "orchestrator",
  phase: "Ready",
  tool: "paperclip",
  toolVersion: null,
  registrationMode: "managed",
  limit: "private",
  webUi: surface(),
  webApi: surface({ exposure: "off", effective: "off", hostname: null, url: null }),
  connectedAgents: 2,
  unmanagedToolAgents: [],
  version: 7,
  generation: 7,
  status: { phase: "Ready", observedGeneration: 7, conditions: [] },
  ...over,
});
const mk = (f: ReturnType<typeof fakeFetch>) =>
  createAfs({
    endpoint: "https://x",
    fetch: f.fetch,
    auth: apiKey("afsk_k"),
    retry: { sleep: async () => {} },
  });

describe("orchestration resource (WEB-US-46)", () => {
  it("get reads the team's orchestration", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/orchestration", { body: resource() });
    const r = await mk(f).orchestration.get("team_1");
    expect(r.tool).toBe("paperclip");
    expect(r.webUi.effective).toBe("private");
  });
  it("put sends If-Match from the version it was given", async () => {
    const f = fakeFetch().on("PUT /v1/teams/team_1/orchestration", {
      body: resource({ version: 8 }),
      headers: { ETag: '"8"' },
    });
    const body = { webUi: { exposure: "public" }, webApi: { exposure: "off" } };
    const r = await mk(f).orchestration.put({ id: "team_1", version: 7 }, body);
    expect(f.requests[0]?.headers.get("if-match")).toBe('"7"');
    expect(f.requests[0]?.body).toEqual(body);
    expect(r.version).toBe(8);
  });
  it("changeTool posts the tool to the action path", async () => {
    const f = fakeFetch().on("POST /v1/teams/team_1/orchestration:change-tool", {
      status: 202,
      body: resource({ tool: "buzz" }),
    });
    const r = await mk(f).orchestration.changeTool("team_1", { tool: "buzz" });
    expect(f.requests[0]?.body).toEqual({ tool: "buzz" });
    expect(r.tool).toBe("buzz");
  });
  it("lists the endpoints with their filters", async () => {
    const f = fakeFetch().on("GET /v1/admin/orchestration-endpoints", {
      body: { items: [], migration: { state: "complete" } },
    });
    await mk(f)
      .admin.orchestrationEndpoints.list({ exposure: "public", tool: "paperclip" })
      .first();
    expect(f.requests[0]?.url).toContain("exposure=public");
  });
  it("puts the service model access", async () => {
    const f = fakeFetch().on("PUT /v1/admin/model-access", {
      body: { access: "all", enabledModels: 4, callableModels: 3, version: 2 },
    });
    const r = await mk(f).admin.models.putServiceAccess({ access: "all" });
    expect(r.callableModels).toBe(3);
  });
  it("exposes the response metadata", async () => {
    const f = fakeFetch().on("GET /v1/teams/team_1/orchestration", {
      body: resource(),
      headers: { ETag: '"7"' },
    });
    const r = await mk(f).orchestration.get("team_1");
    expect(metaOf(r)?.etag).toBeDefined();
  });
});

describe("endpointUrls", () => {
  it("returns the effective addresses", () => {
    const u = endpointUrls(resource() as never);
    expect(u.webUi).toEqual({ url: "https://payments.collab.corp.example.com/", reason: null });
  });
  it("returns null with the first reason when a surface is off", () => {
    const u = endpointUrls(
      resource({
        webApi: surface({
          supported: false,
          exposure: "off",
          effective: "off",
          reasons: ["tool_not_supported"],
          hostname: null,
          url: null,
        }),
      }) as never,
    );
    expect(u.webApi).toEqual({ url: null, reason: "tool_not_supported" });
  });
  it("never returns an address for an effective-off surface", () => {
    const u = endpointUrls(
      resource({ webUi: surface({ effective: "off", reasons: ["team_limit"] }) }) as never,
    );
    expect(u.webUi.url).toBeNull();
    expect(u.webUi.reason).toBe("team_limit");
  });
  it("is part of createOrchestration", () => {
    const core = new AfsClient({ endpoint: "https://x", auth: apiKey("afsk_k") });
    expect(createOrchestration(core).endpointUrls).toBe(endpointUrls);
  });
});

describe("model access (WEB-US-49)", () => {
  it("agents.create accepts models and no modelId", async () => {
    const f = fakeFetch().on("POST /v1/teams/team_1/agents", {
      status: 202,
      body: { id: "agt_2" },
    });
    await mk(f).agents.create("team_1", {
      name: "w",
      template: "t",
      image: "i",
      models: { access: "selected", modelIds: ["a", "b"], defaultModelId: "a" },
    });
    expect(f.requests[0]?.body).toMatchObject({
      models: { access: "selected", defaultModelId: "a" },
    });
  });
  it("teams.models.put takes access and ids", async () => {
    const f = fakeFetch().on("PUT /v1/teams/team_1/models", {
      body: { access: "selected", modelIds: ["a"], items: [] },
    });
    await mk(f).teams.models.put(
      { id: "team_1", version: 3 },
      { access: "selected", modelIds: ["a"] },
    );
    expect(f.requests[0]?.body).toEqual({ access: "selected", modelIds: ["a"] });
    expect(f.requests[0]?.headers.get("if-match")).toBe('"3"');
  });
  it("pools.create accepts models", async () => {
    const f = fakeFetch().on("POST /v1/teams/team_1/pools", {
      status: 202,
      body: { id: "pool_1" },
    });
    await mk(f).pools.create("team_1", {
      name: "p",
      template: "t",
      image: "i",
      workers: 1,
      models: { access: "all", defaultModelId: "a" },
    });
    expect(f.requests[0]?.body).toMatchObject({ models: { access: "all" } });
  });
});
