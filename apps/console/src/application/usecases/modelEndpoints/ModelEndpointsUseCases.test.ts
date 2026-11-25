import { describe, expect, it, vi } from "vitest";
import { type EndpointDraft, emptyEndpointDraft } from "../../../domain/modelEndpoints.js";
import { AppError } from "../../errors.js";
import type { AgentRecord } from "../../ports/agents.js";
import type {
  AdminModelEndpointsPort,
  EndpointRecord,
  InferenceProvidersPort,
  InferenceReportsPort,
  TeamEndpointRecord,
  TeamModelEndpointsPort,
} from "../../ports/modelEndpoints.js";
import {
  AdminModelEndpointsUseCases,
  AgentRoutesUseCases,
  InferenceReportUseCases,
  ProviderPolicyUseCases,
  routesSpecOf,
  TeamModelEndpointsUseCases,
} from "./ModelEndpointsUseCases.js";

const NOW = Date.parse("2026-11-25T00:00:00Z");
const clock = { now: () => NOW };

const endpoint = (over: Partial<EndpointRecord> = {}): EndpointRecord => ({
  id: "mep_1",
  slug: "azure-openai",
  displayName: "Azure OpenAI",
  teamId: null,
  provider: "azure_openai",
  providerState: "on",
  location: "external",
  baseUrl: "https://example.invalid/openai/v1",
  protocols: ["openai_chat"],
  authKind: "bearer",
  credentialMode: "per_team",
  pricingMode: "per_token",
  requiresTerms: false,
  enabled: true,
  models: [
    {
      modelName: "chat-large",
      maxOutputTokens: 8192,
      enabled: true,
      callable: true,
      price: { inputUsdPerMtok: "1.25", outputUsdPerMtok: "10.00" },
    },
  ],
  version: 3,
  ...over,
});

const teamEndpoint = (over: Partial<TeamEndpointRecord> = {}): TeamEndpointRecord => ({
  id: "mep_1",
  slug: "azure-openai",
  displayName: "Azure OpenAI",
  teamId: null,
  relation: "selected",
  selectableBy: "team_admin",
  provider: "azure_openai",
  providerState: "on",
  location: "external",
  pricingMode: "per_token",
  protocols: ["openai_chat"],
  credentialState: "set",
  enabled: true,
  offReason: null,
  models: [],
  version: 1,
  ...over,
});

const adminPort = (over: Partial<AdminModelEndpointsPort> = {}): AdminModelEndpointsPort => ({
  list: vi.fn(async (includeTeams: boolean) =>
    [
      endpoint({ id: "mep_z", slug: "zeta" }),
      endpoint({ id: "mep_t", slug: "coder", teamId: "team_1" }),
      endpoint({ id: "mep_b", slug: "bedrock", builtin: true, provider: "bedrock" }),
      endpoint(),
    ].filter((e) => includeTeams || e.teamId === null),
  ),
  get: vi.fn(async () => endpoint()),
  create: vi.fn(async () => endpoint({ id: "mep_new", enabled: false })),
  setEnabled: vi.fn(async () => endpoint({ enabled: false })),
  delete: vi.fn(async () => undefined),
  createPrice: vi.fn(async () => undefined),
  teams: vi.fn(async () => []),
  putCredential: vi.fn(async () => ({ state: "set", rotatedAt: null })),
  rotateCredential: vi.fn(async () => ({ state: "set", rotatedAt: "2026-11-25T00:00:00Z" })),
  putFederation: vi.fn(async () => ({ status: "pending" })),
  proposals: vi.fn(async () => [
    {
      id: "epp_1",
      endpointId: "mep_1",
      modelName: "chat-large",
      effectiveFrom: "2026-12-01T00:00:00Z",
      fetchedAt: "2026-11-24T00:00:00Z",
      inputUsdPerMtok: "1.00",
      outputUsdPerMtok: "8.00",
      status: "pending",
    },
    {
      id: "epp_2",
      endpointId: "mep_gone",
      slug: "old-route",
      modelName: "x",
      effectiveFrom: "2026-12-01T00:00:00Z",
      fetchedAt: "2026-11-24T00:00:00Z",
      inputUsdPerMtok: "1.00",
      outputUsdPerMtok: "8.00",
      status: "pending",
    },
    {
      id: "epp_3",
      endpointId: "mep_unknown",
      modelName: "y",
      effectiveFrom: "2026-12-01T00:00:00Z",
      fetchedAt: "2026-11-24T00:00:00Z",
      inputUsdPerMtok: "1.00",
      outputUsdPerMtok: "8.00",
      status: "pending",
    },
  ]),
  approve: vi.fn(async () => ({}) as never),
  reject: vi.fn(async () => ({}) as never),
  putGatewaySettings: vi.fn(async () => ({}) as never),
  ...over,
});

const draft = (over: Partial<EndpointDraft> = {}): EndpointDraft => ({
  ...emptyEndpointDraft("service"),
  slug: "azure-openai",
  displayName: "Azure OpenAI",
  baseUrl: "https://example.invalid/openai/v1",
  models: [
    {
      modelName: "chat-large",
      maxOutputTokens: 8192,
      inputUsdPerMtok: "1.25",
      outputUsdPerMtok: "10",
    },
    { modelName: "chat-small", maxOutputTokens: 4096 },
  ],
  ...over,
});

const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error("expected a rejection");
};

describe("AdminModelEndpointsUseCases (MEG-WEB-2)", () => {
  it("splits the catalog: built-in first then by route name, team-declared apart", async () => {
    const uc = new AdminModelEndpointsUseCases(adminPort(), clock);
    const c = await uc.catalog();
    expect(c.service.map((e) => e.slug)).toEqual(["bedrock", "azure-openai", "zeta"]);
    expect(c.team.map((e) => e.slug)).toEqual(["coder"]);
  });

  it("passes detail and teams through", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    await uc.detail("mep_1");
    await uc.teams("mep_1");
    expect(port.get).toHaveBeenCalledWith("mep_1", undefined);
    expect(port.teams).toHaveBeenCalledWith("mep_1", undefined);
  });

  it("creates, then prices each fully priced per-token model effective now", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    const e = await uc.create(draft());
    expect(e.id).toBe("mep_new");
    expect(port.create).toHaveBeenCalledOnce();
    expect(port.createPrice).toHaveBeenCalledTimes(1);
    expect(port.createPrice).toHaveBeenCalledWith("mep_new", {
      modelName: "chat-large",
      inputUsdPerMtok: "1.25",
      outputUsdPerMtok: "10",
      effectiveFrom: "2026-11-25T00:00:00.000Z",
    });
  });

  it("adds no price for a capacity endpoint", async () => {
    const port = adminPort();
    await new AdminModelEndpointsUseCases(port, clock).create(draft({ pricingMode: "capacity" }));
    expect(port.createPrice).not.toHaveBeenCalled();
  });

  it("sends nothing when the form is invalid", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    const err = await rejection(uc.create(draft({ slug: "bedrock" })));
    expect(err).toBeInstanceOf(AppError);
    expect(err.fields?.slug).toMatch(/reserved/);
    const taken = await rejection(uc.create(draft(), ["azure-openai"]));
    expect(taken.fields?.slug).toMatch(/already used/);
    expect(port.create).not.toHaveBeenCalled();
  });

  it("adds a valid price and refuses a malformed one", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    const p = {
      modelName: "chat-large",
      inputUsdPerMtok: "1.25",
      outputUsdPerMtok: "10",
      effectiveFrom: "2026-12-01T00:00:00Z",
    };
    await uc.addPrice("mep_1", p);
    expect(port.createPrice).toHaveBeenCalledWith("mep_1", p);
    const err = await rejection(
      uc.addPrice("mep_1", {
        ...p,
        inputUsdPerMtok: "x",
        outputUsdPerMtok: "",
        effectiveFrom: "no",
      }),
    );
    expect(Object.keys(err.fields).sort()).toEqual([
      "effectiveFrom",
      "inputUsdPerMtok",
      "outputUsdPerMtok",
    ]);
    expect(port.createPrice).toHaveBeenCalledOnce();
  });

  it("switches an endpoint with its version, but never the built-in Bedrock route", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    await uc.setEnabled({ id: "mep_1", version: 3, slug: "azure-openai" }, false);
    expect(port.setEnabled).toHaveBeenCalledWith({ id: "mep_1", version: 3 }, false);
    const err = await rejection(uc.setEnabled({ id: "b", version: 1, slug: "bedrock" }, false));
    expect(err.message).toMatch(/Provider policy/);
    expect(port.setEnabled).toHaveBeenCalledOnce();
  });

  it("deletes only an endpoint that is off", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    const err = await rejection(uc.delete({ id: "mep_1", version: 3, enabled: true }));
    expect(err.message).toMatch(/Turn the endpoint off/);
    await uc.delete({ id: "mep_1", version: 3, enabled: false });
    expect(port.delete).toHaveBeenCalledWith({ id: "mep_1", version: 3 });
  });

  it("sends a credential value once and refuses an empty one (TC-UI-06)", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    expect(await uc.setCredential("mep_1", "team_1", "v")).toEqual({
      state: "set",
      rotatedAt: null,
    });
    await uc.rotateCredential("mep_1", "shared", "w");
    expect(port.putCredential).toHaveBeenCalledWith("mep_1", "team_1", "v");
    expect(port.rotateCredential).toHaveBeenCalledWith("mep_1", "shared", "w");
    expect((await rejection(uc.setCredential("mep_1", "team_1", ""))).fields?.value).toBeDefined();
    expect((await rejection(uc.rotateCredential("mep_1", "shared", ""))).message).toMatch(
      /credential/,
    );
    expect(port.putCredential).toHaveBeenCalledOnce();
    expect(port.rotateCredential).toHaveBeenCalledOnce();
  });

  it("trims federation fields, drops empty ones and refuses an empty form", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    await uc.putFederation("mep_1", "team_1", { expectedIssuer: " iss ", expectedSubject: " " });
    expect(port.putFederation).toHaveBeenCalledWith("mep_1", "team_1", { expectedIssuer: "iss" });
    await expect(uc.putFederation("mep_1", "team_1", { expectedIssuer: "" })).rejects.toThrow(
      /identifiers/,
    );
  });

  it("joins each pending proposal to the price it would replace", async () => {
    const port = adminPort();
    const rows = await new AdminModelEndpointsUseCases(port, clock).pendingProposals();
    expect(port.proposals).toHaveBeenCalledWith("pending", undefined);
    expect(rows.map((r) => r.slug)).toEqual(["azure-openai", "old-route", "mep_unknown"]);
    expect(rows[0]?.old).toEqual({ inputUsdPerMtok: "1.25", outputUsdPerMtok: "10.00" });
    expect(rows[1]?.old).toBeUndefined();
  });

  it("approves or rejects with a trimmed note, none when blank", async () => {
    const port = adminPort();
    const uc = new AdminModelEndpointsUseCases(port, clock);
    await uc.decide("epp_1", "approve", " ok ");
    await uc.decide("epp_2", "reject", "  ");
    await uc.decide("epp_3", "reject");
    expect(port.approve).toHaveBeenCalledWith("epp_1", "ok");
    expect(port.reject).toHaveBeenNthCalledWith(1, "epp_2", undefined);
    expect(port.reject).toHaveBeenNthCalledWith(2, "epp_3", undefined);
  });

  it("puts gateway settings with the team version", async () => {
    const port = adminPort();
    const v = { deployment: "per_namespace", mayAddModelEndpoints: true };
    await new AdminModelEndpointsUseCases(port, clock).putGatewaySettings("team_1", 7, v);
    expect(port.putGatewaySettings).toHaveBeenCalledWith("team_1", 7, v);
  });
});

const providers = (): InferenceProvidersPort => ({
  list: vi.fn(async () => []),
  impact: vi.fn(async () => ({}) as never),
  update: vi.fn(async () => ({}) as never),
});

describe("ProviderPolicyUseCases (MEG-WEB-2)", () => {
  const bedrock = { provider: "bedrock", version: 2 };
  const ready = {
    provider: "bedrock",
    reason: " Enterprise policy ",
    fallbackModel: "azure-openai/chat-large",
    selectForAllTeams: true,
  };

  it("lists providers and the fallback candidates", async () => {
    const p = providers();
    const uc = new ProviderPolicyUseCases(p, adminPort());
    await uc.list();
    expect(p.list).toHaveBeenCalled();
    expect(await uc.fallbackOptions()).toEqual(["azure-openai/chat-large", "zeta/chat-large"]);
  });

  it("previews the impact as a dry run, with a placeholder reason while none is typed", async () => {
    const p = providers();
    const uc = new ProviderPolicyUseCases(p, adminPort());
    // the preview of Bedrock is always the allowed change: fallback selected for every team
    await uc.impact(bedrock, { ...ready, reason: "", selectForAllTeams: false });
    expect(p.impact).toHaveBeenCalledWith(bedrock, {
      enabled: false,
      reason: "impact preview",
      fallbackModel: "azure-openai/chat-large",
      selectForAllTeams: true,
    });
    await uc.impact({ provider: "openai", version: 1 }, { ...ready, provider: "openai" });
    expect(p.impact).toHaveBeenLastCalledWith(
      { provider: "openai", version: 1 },
      { enabled: false, reason: "Enterprise policy" },
    );
  });

  it("turns Bedrock off only with a fallback, every team selected and a reason (TC-UI-11)", async () => {
    const p = providers();
    const uc = new ProviderPolicyUseCases(p, adminPort());
    await expect(uc.turnOff(bedrock, { ...ready, fallbackModel: "" })).rejects.toThrow(/fallback/);
    await expect(uc.turnOff(bedrock, { ...ready, selectForAllTeams: false })).rejects.toThrow(
      /every team/,
    );
    await expect(uc.turnOff(bedrock, { ...ready, reason: " " })).rejects.toThrow(/reason/);
    expect(p.update).not.toHaveBeenCalled();
    await uc.turnOff(bedrock, ready);
    expect(p.update).toHaveBeenCalledWith(bedrock, {
      enabled: false,
      reason: "Enterprise policy",
      fallbackModel: "azure-openai/chat-large",
      selectForAllTeams: true,
    });
  });

  it("turns a provider back on, with the reason when one is given", async () => {
    const p = providers();
    const uc = new ProviderPolicyUseCases(p, adminPort());
    await uc.turnOn(bedrock, "");
    expect(p.update).toHaveBeenLastCalledWith(bedrock, { enabled: true });
    await uc.turnOn(bedrock, " back ");
    expect(p.update).toHaveBeenLastCalledWith(bedrock, { enabled: true, reason: "back" });
  });
});

const teamPort = (): TeamModelEndpointsPort => ({
  list: vi.fn(async () => ({
    gatewayDeployment: "per_namespace",
    mayAddModelEndpoints: true,
    items: [
      teamEndpoint({ id: "b", slug: "zeta", relation: "available" }),
      teamEndpoint({ id: "a", slug: "bedrock" }),
      teamEndpoint({ id: "c", slug: "azure-openai" }),
      teamEndpoint({ id: "d", slug: "coder", relation: "own", teamId: "team_1" }),
    ],
  })),
  putSelections: vi.fn(async (_t: string, ids: readonly string[]) => ids),
  create: vi.fn(async () => teamEndpoint()),
  delete: vi.fn(async () => undefined),
  putCredential: vi.fn(async () => ({ state: "set", rotatedAt: null })),
});

describe("TeamModelEndpointsUseCases (MEG-WEB-3)", () => {
  it("groups routes into selected, own and available", async () => {
    const r = await new TeamModelEndpointsUseCases(teamPort()).routes("team_1");
    expect(r.gatewayDeployment).toBe("per_namespace");
    expect(r.mayAddModelEndpoints).toBe(true);
    expect(r.selected.map((e) => e.slug)).toEqual(["azure-openai", "bedrock"]);
    expect(r.own.map((e) => e.slug)).toEqual(["coder"]);
    expect(r.available.map((e) => e.slug)).toEqual(["zeta"]);
  });

  it("replaces the whole selection to add or remove one route", async () => {
    const port = teamPort();
    const uc = new TeamModelEndpointsUseCases(port);
    const current = [teamEndpoint({ id: "a" }), teamEndpoint({ id: "c" })];
    await uc.add("team_1", current, "b");
    expect(port.putSelections).toHaveBeenLastCalledWith("team_1", ["a", "c", "b"]);
    await uc.add("team_1", current, "a");
    expect(port.putSelections).toHaveBeenLastCalledWith("team_1", ["a", "c"]);
    await uc.remove("team_1", current, "a");
    expect(port.putSelections).toHaveBeenLastCalledWith("team_1", ["c"]);
  });

  it("creates a valid team endpoint and sends nothing for an invalid one", async () => {
    const port = teamPort();
    const uc = new TeamModelEndpointsUseCases(port);
    const d: EndpointDraft = {
      ...emptyEndpointDraft("team"),
      slug: "coder",
      displayName: "Coder",
      baseUrl: "http://vllm-coder:8000/v1",
      owner: "payments-ml",
      purpose: "Code review",
    };
    const err = await rejection(uc.create("team_1", { ...d, owner: "" }));
    expect(err.fields?.owner).toBeDefined();
    expect(port.create).not.toHaveBeenCalled();
    await uc.create("team_1", d);
    expect(port.create).toHaveBeenCalledWith("team_1", expect.objectContaining({ slug: "coder" }));
  });

  it("deletes with the version and sets a credential once", async () => {
    const port = teamPort();
    const uc = new TeamModelEndpointsUseCases(port);
    await uc.delete("team_1", { id: "d", version: 2 });
    expect(port.delete).toHaveBeenCalledWith("team_1", { id: "d", version: 2 });
    await expect(uc.setCredential("team_1", "d", "")).rejects.toThrow(/credential/);
    await uc.setCredential("team_1", "d", "v");
    expect(port.putCredential).toHaveBeenCalledExactlyOnceWith("team_1", "d", "v");
  });
});

describe("InferenceReportUseCases (MEG-WEB-2, -3)", () => {
  const data = {
    range: { from: "2026-11-01", to: "2026-11-25" },
    groupBy: ["route"],
    rows: [
      { route: "bedrock", calls: 1, errors: 0, inputTokens: 1, outputTokens: 1, costUsd: "4.00" },
      { calls: 1, errors: 0, inputTokens: 1, outputTokens: 1, costUsd: "1.00" },
    ],
    totals: { calls: 2, errors: 0, inputTokens: 2, outputTokens: 2, costUsd: "5.00" },
    notes: [],
  };

  it("runs and exports through the port", async () => {
    const port: InferenceReportsPort = {
      run: vi.fn(async () => data),
      csv: vi.fn(async () => "route,calls\n"),
    };
    const uc = new InferenceReportUseCases(port);
    const scope = { level: "team" as const, teamId: "team_1" };
    expect(await uc.run(scope, { range: "mtd" })).toBe(data);
    expect(await uc.csv(scope, { range: "mtd" })).toBe("route,calls\n");
    expect(port.run).toHaveBeenCalledWith(scope, { range: "mtd" }, undefined);
  });

  it("maps spend by route, skipping rows without one", () => {
    expect([...InferenceReportUseCases.spendByRoute(data)]).toEqual([["bedrock", "4.00"]]);
  });
});

const agent = (models: AgentRecord["models"]): AgentRecord =>
  ({ id: "agt_1", version: 4, models }) as unknown as AgentRecord;

describe("AgentRoutesUseCases (MEG-WEB-3)", () => {
  const team = [
    { slug: "bedrock", protocols: ["openai_chat"], models: ["model-a"] },
    { slug: "azure-openai", protocols: ["openai_chat"], models: ["chat-large"] },
  ];

  it("saves the routes with If-Match, keeping the Bedrock selection and sending route/model", async () => {
    const update = vi.fn(async () => ({}) as never);
    const uc = new AgentRoutesUseCases({ update });
    await uc.save(
      "team_1",
      agent({ access: "selected", modelIds: ["model-a"], defaultModelId: "model-a" }),
      {
        routeAccess: "selected",
        routes: ["azure-openai"],
        defaultRoute: "azure-openai",
        defaultModel: "chat-large",
      },
      team,
    );
    expect(update).toHaveBeenCalledWith(
      "team_1",
      { id: "agt_1", version: 4 },
      {
        models: {
          access: "selected",
          modelIds: ["model-a"],
          defaultModelId: "azure-openai/chat-large",
          routeAccess: "selected",
          routes: ["azure-openai"],
          defaultRoute: "azure-openai",
        },
      },
    );
  });

  it("drops a route default back to the Bedrock default model", async () => {
    const update = vi.fn(async () => ({}) as never);
    const uc = new AgentRoutesUseCases({ update });
    const spec = { routeAccess: "all" as const, routes: [], defaultRoute: "", defaultModel: "" };
    await uc.save(
      "team_1",
      agent({
        access: "all",
        modelIds: [],
        defaultModelId: "azure-openai/chat-large",
        effectiveModelIds: ["model-a"],
        defaultRoute: "azure-openai",
      }),
      spec,
      team,
    );
    expect(update).toHaveBeenLastCalledWith("team_1", expect.anything(), {
      models: {
        access: "all",
        defaultModelId: "model-a",
        routeAccess: "all",
        defaultRoute: null,
      },
    });
    await uc.save(
      "team_1",
      agent({
        access: "all",
        modelIds: [],
        defaultModelId: "azure-openai/chat-large",
        defaultRoute: "azure-openai",
      }),
      spec,
      team,
    );
    expect(update).toHaveBeenLastCalledWith("team_1", expect.anything(), {
      models: expect.objectContaining({ defaultModelId: "azure-openai/chat-large" }),
    });
    await uc.save(
      "team_1",
      agent({ access: "all", modelIds: [], defaultModelId: "model-a" }),
      spec,
      team,
    );
    expect(update).toHaveBeenLastCalledWith("team_1", expect.anything(), {
      models: expect.objectContaining({ defaultModelId: "model-a" }),
    });
  });

  it("sends nothing when the routes are invalid", async () => {
    const update = vi.fn();
    const uc = new AgentRoutesUseCases({ update });
    const err = await rejection(
      uc.save(
        "team_1",
        agent({ access: "all", modelIds: [], defaultModelId: "model-a" }),
        { routeAccess: "selected", routes: [], defaultRoute: "", defaultModel: "" },
        team,
      ),
    );
    expect(err.fields?.routes).toBeDefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("reads the route spec an agent holds", () => {
    expect(routesSpecOf(agent({ access: "all", modelIds: [], defaultModelId: "model-a" }))).toEqual(
      { routeAccess: "all", routes: [], defaultRoute: "", defaultModel: "" },
    );
    expect(
      routesSpecOf(
        agent({
          access: "all",
          modelIds: [],
          defaultModelId: "azure-openai/chat-large",
          routeAccess: "selected",
          routes: ["azure-openai"],
          defaultRoute: "azure-openai",
        }),
      ),
    ).toEqual({
      routeAccess: "selected",
      routes: ["azure-openai"],
      defaultRoute: "azure-openai",
      defaultModel: "chat-large",
    });
    expect(
      routesSpecOf(
        agent({
          access: "all",
          modelIds: [],
          defaultModelId: "chat-large",
          defaultRoute: "azure-openai",
        }),
      ).defaultModel,
    ).toBe("chat-large");
  });
});
