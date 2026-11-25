import { describe, expect, it } from "vitest";
import { apiKey } from "../core/auth.js";
import { AfsClient } from "../core/client.js";
import { ModelEndpointReason } from "../core/reasons.js";
import { createAfs } from "../generated/index.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import {
  createInferenceProviders,
  formatRouteModel,
  isRouteName,
  parseRouteModel,
  routeBaseUrlEnv,
} from "./modelEndpoints.js";
import { createReports } from "./reports.js";

const client = (f: ReturnType<typeof fakeFetch>) =>
  new AfsClient({
    endpoint: "https://x",
    fetch: f.fetch,
    auth: apiKey("afsk_k"),
    retry: { sleep: async () => {} },
  });
const provider = (over: Record<string, unknown> = {}) => ({
  provider: "bedrock",
  displayName: "Amazon Bedrock",
  enabled: true,
  hosts: [],
  teamSelection: "team_admin",
  routes: 1,
  teams: 2,
  directSystems: 0,
  version: 3,
  ...over,
});

describe("route names (MEG-WEB-1)", () => {
  it.each([
    ["openai-prod", "AFS_LLM_OPENAI_PROD_BASE_URL"],
    ["coder-vllm", "AFS_LLM_CODER_VLLM_BASE_URL"],
    ["bedrock", "AFS_LLM_BEDROCK_BASE_URL"],
  ])("%s → %s", (slug, env) => expect(routeBaseUrlEnv(slug)).toBe(env));
  it("accepts DNS labels only", () => {
    expect(isRouteName("openai-prod")).toBe(true);
    expect(isRouteName("Openai")).toBe(false);
    expect(isRouteName("9x")).toBe(false);
    expect(isRouteName("a")).toBe(false);
  });
  it("parses and formats route models", () => {
    expect(parseRouteModel("azure-openai/gpt-5.1")).toEqual({
      route: "azure-openai",
      model: "gpt-5.1",
    });
    expect(parseRouteModel("coder-vllm/Qwen/Qwen3-Coder")).toEqual({
      route: "coder-vllm",
      model: "Qwen/Qwen3-Coder",
    });
    expect(parseRouteModel("anthropic.claude-sonnet-4-5")).toBeNull();
    expect(parseRouteModel("/x")).toBeNull();
    expect(parseRouteModel("route/")).toBeNull();
    expect(parseRouteModel("Bad/x")).toBeNull();
    expect(formatRouteModel({ route: "openai-prod", model: "gpt-4.1" })).toBe(
      "openai-prod/gpt-4.1",
    );
  });
  it("names the contract's error reasons", () => {
    expect(ModelEndpointReason.NoFallbackModel).toBe("no_fallback_model");
    expect(ModelEndpointReason.NeedsServiceAdmin).toBe("needs_service_admin");
  });
});

describe("inference providers (MEG-WEB-1)", () => {
  it("impactOf sends dryRun with If-Match and the Bedrock fallback", async () => {
    const f = fakeFetch().on("PATCH /v1/admin/inference-providers/bedrock", {
      body: provider({
        impact: {
          routes: 1,
          teams: 2,
          agents: 9,
          agentsDegraded: 1,
          agentsMovingToFallback: 8,
          directSystems: 0,
          teamsToSelect: 1,
        },
      }),
    });
    const p = createInferenceProviders(client(f));
    const r = await p.impactOf(
      { id: "bedrock", version: 3 },
      { reason: "policy", fallbackModel: "azure-openai/gpt-5.1", selectForAllTeams: true },
    );
    expect(f.requests[0]?.query.get("dryRun")).toBe("true");
    expect(f.requests[0]?.headers.get("if-match")).toBe('"3"');
    expect(f.requests[0]?.body).toEqual({
      enabled: false,
      reason: "policy",
      fallbackModel: "azure-openai/gpt-5.1",
      selectForAllTeams: true,
    });
    expect(r.impact?.agentsMovingToFallback).toBe(8);
  });
  it("turnOff and turnOn write without dryRun", async () => {
    const f = fakeFetch().on("PATCH /v1/admin/inference-providers/openrouter", {
      body: provider({ provider: "openrouter", enabled: false }),
    });
    const p = createInferenceProviders(client(f));
    await p.turnOff({ id: "openrouter", version: 2 }, { reason: "not allowed" });
    await p.turnOn({ id: "openrouter", version: 3 }, "allowed again");
    await p.turnOn({ id: "openrouter", version: 4 });
    expect(f.requests[0]?.query.get("dryRun")).toBeNull();
    expect(f.requests[0]?.body).toEqual({ enabled: false, reason: "not allowed" });
    expect(f.requests[1]?.body).toEqual({ enabled: true, reason: "allowed again" });
    expect(f.requests[2]?.body).toEqual({ enabled: true });
  });
  it("reads the version from the provider list when given a name", async () => {
    const f = fakeFetch()
      .on("GET /v1/admin/inference-providers", { body: { items: [provider({ version: 5 })] } })
      .on("PATCH /v1/admin/inference-providers/bedrock", { body: provider({ version: 6 }) });
    await createInferenceProviders(client(f)).turnOn("bedrock");
    expect(f.requests[1]?.headers.get("if-match")).toBe('"5"');
  });
  it("is reachable through the facade too", async () => {
    const f = fakeFetch().on("GET /v1/admin/inference-providers", { body: { items: [] } });
    const afs = createAfs({ endpoint: "https://x", fetch: f.fetch, auth: apiKey("afsk_k") });
    expect((await afs.admin.inferenceProviders.list()).items).toEqual([]);
  });
});

describe("inference report (MEG-WEB-1)", () => {
  const report = {
    groupBy: ["route"],
    notes: [],
    range: { from: "2026-11-18T00:00:00Z", to: "2026-11-25T00:00:00Z" },
    rows: [],
    totals: { calls: 0, errors: 0, inputTokens: 0, outputTokens: 0, costUsd: "0.00" },
  };
  it("joins groupBy and passes filters on the service and team reports", async () => {
    const f = fakeFetch()
      .on("GET /v1/reports/inference", { body: report })
      .on("GET /v1/teams/team_1/reports/inference", { body: report });
    const r = createReports(client(f));
    await r.inference({ range: "7d", groupBy: ["route", "model"], teamId: "team_1" });
    await r.teamInference("team_1", { groupBy: "agent", route: "openai-prod" });
    await r.inference();
    expect(f.requests[0]?.query.get("groupBy")).toBe("route,model");
    expect(f.requests[0]?.query.get("teamId")).toBe("team_1");
    expect(f.requests[1]?.query.get("groupBy")).toBe("agent");
    expect(f.requests[1]?.query.get("route")).toBe("openai-prod");
  });
});

describe("plain list readers", () => {
  it("a provider missing from the list is NotFound", async () => {
    const f = fakeFetch().on("GET /v1/admin/inference-providers", { body: { items: [] } });
    await expect(createInferenceProviders(client(f)).turnOn("azure")).rejects.toMatchObject({
      code: "NotFound",
    });
  });
});
