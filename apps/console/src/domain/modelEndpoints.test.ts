import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";
import {
  attentionDot,
  authWord,
  badgesOf,
  capWord,
  createEndpointModelPriceCli,
  createModelEndpointCli,
  createTeamModelEndpointCli,
  credentialView,
  type EndpointDraft,
  effectiveRoutes,
  emptyEndpointDraft,
  fallbackCandidates,
  federationView,
  healthView,
  locationWord,
  offReasonText,
  optInBlock,
  pricingWord,
  protocolWords,
  providerCredentialWord,
  providerOffBlock,
  providerStateView,
  putEndpointFederationCli,
  putModelEndpointCredentialCli,
  putTeamGatewaySettingsCli,
  putTeamModelEndpointCredentialCli,
  putTeamModelEndpointsCli,
  renderEnv,
  routeBaseUrlEnv,
  routeEnvPreview,
  selectedByWord,
  serviceStateView,
  teamSelectionWord,
  toCreateServiceBody,
  toCreateTeamBody,
  toRoutesBody,
  unpricedModels,
  updateAgentRoutesCli,
  updateInferenceProviderCli,
  updateModelEndpointEnabledCli,
  validateEndpoint,
  validateRoutes,
} from "./modelEndpoints.js";

const draft = (over: Partial<EndpointDraft> = {}): EndpointDraft => ({
  ...emptyEndpointDraft("service"),
  slug: "openrouter",
  displayName: "OpenRouter",
  baseUrl: "https://openrouter.ai/api/v1",
  provider: "openrouter",
  models: [
    {
      modelName: "qwen3-coder",
      maxOutputTokens: 8192,
      inputUsdPerMtok: "0.22",
      outputUsdPerMtok: "0.95",
    },
  ],
  ...over,
});

describe("words and badges (screens 56, 61)", () => {
  it("names locations, pricing, protocols and auth", () => {
    expect(locationWord("in_namespace")).toBe("In namespace");
    expect(locationWord("x")).toBe("x");
    expect(pricingWord("per_token")).toBe("Per token");
    expect(pricingWord("y")).toBe("y");
    expect(protocolWords(["openai_chat", "openai_responses", "openai_embeddings", "z"])).toBe(
      "Chat, Responses, Embeddings, z",
    );
    expect(authWord("azure_federated")).toContain("Azure");
    expect(authWord("q")).toBe("q");
  });
  it("orders badges Built-in, Metered, Capped, Extra terms", () => {
    expect(badgesOf({ builtin: true, pricingMode: "per_token" })).toEqual([
      "Built-in",
      "Metered",
      "Capped",
    ]);
    expect(badgesOf({ pricingMode: "per_token", requiresTerms: true })).toEqual([
      "Metered",
      "Capped",
      "Extra terms",
    ]);
    expect(badgesOf({ pricingMode: "capacity" })).toEqual(["Metered"]);
    expect(badgesOf({ pricingMode: "free", metered: false, capped: false })).toEqual([]);
  });
  it("splits what counts against the cap (screen 65)", () => {
    expect(capWord("per_token")).toBe("Capped");
    expect(capWord("bedrock")).toBe("Capped");
    expect(capWord("capacity")).toBe("Reported only");
    expect(capWord("free")).toBe("Reported only");
  });
  it("maps health, service, provider, credential and federation states to dot + word", () => {
    expect(healthView("Ready")).toEqual({ word: "Healthy", dot: "green" });
    expect(healthView("Degraded").dot).toBe("amber");
    expect(healthView(undefined).word).toBe("Unknown");
    expect(healthView("Odd").word).toBe("Odd");
    expect(healthView("Ready", true).word).toBe("Provider off");
    expect(serviceStateView({ enabled: true, providerState: "off" }).word).toBe(
      "Off by provider policy",
    );
    expect(serviceStateView({ enabled: true }).word).toBe("On");
    expect(serviceStateView({ enabled: false }).word).toBe("Off");
    expect(providerStateView(true).word).toBe("On");
    expect(providerStateView(false).dot).toBe("grey");
    expect(credentialView("set").word).toBe("Set");
    expect(credentialView("missing").dot).toBe("red");
    expect(credentialView("other").word).toBe("other");
    expect(federationView("failing").dot).toBe("red");
    expect(federationView("zzz").word).toBe("zzz");
    expect(attentionDot(3)).toBe("amber");
    expect(attentionDot(0)).toBe("grey");
  });
  it("explains off reasons and selections", () => {
    expect(offReasonText("provider_disabled")).toBe("Off by provider policy");
    expect(offReasonText("new_reason")).toBe("new_reason");
    expect(offReasonText(null)).toBeUndefined();
    expect(selectedByWord("service_admin")).toBe("Service admin");
    expect(selectedByWord("team_admin")).toBe("Team-admin");
    expect(selectedByWord(null)).toBe("—");
  });
  it("blocks a team-admin opt-in to a service-selected endpoint (US-63, TC-UI-10)", () => {
    expect(optInBlock({ selectableBy: "service_admin" }, false)).toBe("Needs a service admin");
    expect(optInBlock({ selectableBy: "service_admin" }, true)).toBeUndefined();
    expect(optInBlock({ selectableBy: "team_admin" }, false)).toBeUndefined();
  });
  it("names provider selection and credential kinds (screen 68)", () => {
    expect(teamSelectionWord({ provider: "bedrock", teamSelection: "team_admin" })).toContain(
      "Every team",
    );
    expect(teamSelectionWord({ provider: "azure", teamSelection: "service_admin" })).toBe(
      "Service admins",
    );
    expect(teamSelectionWord({ provider: "openai", teamSelection: "team_admin" })).toBe(
      "Team-admins",
    );
    expect(providerCredentialWord("bedrock")).toBe("Gateway AWS role");
    expect(providerCredentialWord("google")).toBe("Workload identity federation");
    expect(providerCredentialWord("other")).toBe("Team's own key");
    expect(providerCredentialWord("openai")).toBe("API key per team");
  });
});

describe("agent routes and environment (gateway contract §8.2, US-68)", () => {
  const team = ["openai-prod", "bedrock", "coder-vllm", "ml-platform"];
  const spec = {
    routeAccess: "selected" as const,
    routes: ["bedrock", "openai-prod", "coder-vllm"],
    defaultRoute: "openai-prod",
    defaultModel: "chat-large",
  };
  it("puts the default first, then by name", () => {
    expect(effectiveRoutes(spec, team)).toEqual(["openai-prod", "bedrock", "coder-vllm"]);
    expect(effectiveRoutes({ ...spec, routeAccess: "all", defaultRoute: "" }, team)).toEqual([
      "bedrock",
      "coder-vllm",
      "ml-platform",
      "openai-prod",
    ]);
    expect(effectiveRoutes({ ...spec, routes: ["gone"] }, team)).toEqual([]);
  });
  it("renders the exact variables the agent receives", () => {
    const env = routeEnvPreview(spec, team, { gatewayUrl: "https://gw:8443" });
    expect(env.map((l) => l.name)).toEqual([
      "AFS_GATEWAY_URL",
      "AFS_LLM_ROUTES",
      "AFS_LLM_DEFAULT_ROUTE",
      "AFS_LLM_DEFAULT_MODEL",
      "AFS_LLM_OPENAI_PROD_BASE_URL",
      "AFS_LLM_BEDROCK_BASE_URL",
      "AFS_LLM_CODER_VLLM_BASE_URL",
      "OPENAI_BASE_URL",
      "OPENAI_API_KEY",
    ]);
    const text = renderEnv(env);
    expect(text).toContain("AFS_LLM_ROUTES=openai-prod,bedrock,coder-vllm");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the agent's env holds a literal ${...} reference
    expect(text).toContain("OPENAI_BASE_URL=${AFS_LLM_OPENAI_PROD_BASE_URL}");
    expect(text).toContain("OPENAI_API_KEY=afs-gateway  # placeholder");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the agent's env holds a literal ${...} reference
    expect(text).toContain("AFS_LLM_BEDROCK_BASE_URL=${AFS_GATEWAY_URL}/r/bedrock/v1  # OpenAI");
  });
  it("leaves OPENAI_BASE_URL alone when the agent sets it, and has no default without one", () => {
    expect(
      routeEnvPreview(spec, team, { ownOpenAiBaseUrl: true }).some(
        (l) => l.name === "OPENAI_BASE_URL",
      ),
    ).toBe(false);
    const none = routeEnvPreview({ ...spec, defaultRoute: "" }, team);
    expect(none.some((l) => l.name.startsWith("AFS_LLM_DEFAULT"))).toBe(false);
    expect(none[0]?.value).toBe("<team gateway URL>");
    expect(routeEnvPreview({ ...spec, routes: [] }, team)).toHaveLength(1);
    expect(
      routeEnvPreview({ ...spec, defaultModel: "" }, team).some(
        (l) => l.name === "AFS_LLM_DEFAULT_MODEL",
      ),
    ).toBe(false);
  });
  it("validates the selection, the default route and its model", () => {
    const choices = [
      { slug: "openai-prod", protocols: ["openai_chat"], models: ["chat-large"] },
      { slug: "bedrock", protocols: ["openai_chat"], models: [] },
    ];
    expect(validateRoutes(spec, choices)).toEqual({});
    expect(validateRoutes({ ...spec, routes: [] }, choices).routes).toBeTruthy();
    expect(
      validateRoutes({ ...spec, defaultRoute: "coder-vllm" }, choices).defaultRoute,
    ).toBeTruthy();
    expect(validateRoutes({ ...spec, defaultModel: "" }, choices).defaultModel).toBeTruthy();
    expect(validateRoutes({ ...spec, defaultModel: "x" }, choices).defaultModel).toBeTruthy();
    expect(validateRoutes({ ...spec, defaultRoute: "" }, choices)).toEqual({});
  });
  it("builds the UpdateAgent route fields", () => {
    expect(toRoutesBody(spec)).toEqual({
      routeAccess: "selected",
      routes: ["bedrock", "openai-prod", "coder-vllm"],
      defaultRoute: "openai-prod",
    });
    expect(toRoutesBody({ ...spec, routeAccess: "all", defaultRoute: "" })).toEqual({
      routeAccess: "all",
      defaultRoute: null,
    });
  });
});

describe("endpoint forms (screens 57, 62; US-62, US-67)", () => {
  it("accepts a valid service draft", () => {
    expect(validateEndpoint(draft(), "service")).toEqual({});
  });
  it.each([
    [{ slug: "bedrock" }, "slug"],
    [{ slug: "Not A Label" }, "slug"],
    [{ displayName: " " }, "displayName"],
    [{ baseUrl: "" }, "baseUrl"],
    [{ baseUrl: "http://openrouter.ai" }, "baseUrl"],
    [{ protocols: ["openai_responses"] as const }, "protocols"],
    [{ authKind: "header" as const, authHeader: "" }, "authHeader"],
    [{ location: "in_namespace" as const, baseUrl: "http://x:8000/v1" }, "location"],
    [{ models: [{ modelName: "", maxOutputTokens: 1 }] }, "models"],
    [
      {
        models: [
          { modelName: "a", maxOutputTokens: 1 },
          { modelName: "a", maxOutputTokens: 1 },
        ],
      },
      "models",
    ],
    [{ models: [{ modelName: "a", maxOutputTokens: 0 }] }, "models"],
    [{ models: [{ modelName: "a", maxOutputTokens: 1, inputUsdPerMtok: "abc" }] }, "models"],
  ])("refuses %j on %s", (over, field) => {
    expect(
      validateEndpoint(draft(over as Partial<EndpointDraft>), "service")[field as "slug"],
    ).toBeTruthy();
  });
  it("refuses a taken slug and requires owner and purpose on team endpoints", () => {
    expect(validateEndpoint(draft(), "service", ["openrouter"]).slug).toContain("already");
    const t = { ...draft(), location: "in_namespace" as const, baseUrl: "ftp://x" };
    const e = validateEndpoint(t, "team");
    expect(e.owner).toBeTruthy();
    expect(e.purpose).toBeTruthy();
    expect(e.baseUrl).toBeTruthy();
    expect(
      validateEndpoint(
        { ...t, baseUrl: "http://vllm-coder:8000/v1", owner: "me", purpose: "code" },
        "team",
      ),
    ).toEqual({});
  });
  it("lists per-token models without a price (US-62 Not callable)", () => {
    expect(unpricedModels(draft({ models: [{ modelName: "m", maxOutputTokens: 1 }] }))).toEqual([
      "m",
    ]);
    expect(unpricedModels(draft({ pricingMode: "capacity" }))).toEqual([]);
  });
  it("builds the create bodies", () => {
    const b = toCreateServiceBody(
      draft({ description: "d", authKind: "header", authHeader: "X-Key" }),
    );
    expect(b).toMatchObject({
      slug: "openrouter",
      description: "d",
      authHeader: "X-Key",
      models: [{ modelName: "qwen3-coder", maxOutputTokens: 8192 }],
    });
    expect(toCreateServiceBody(draft({ models: [] }))).not.toHaveProperty("models");
    const t = toCreateTeamBody(
      draft({ owner: "o", purpose: "p", description: "x", authKind: "header", authHeader: "H" }),
    );
    expect(t.models?.[0]).toEqual({
      modelName: "qwen3-coder",
      maxOutputTokens: 8192,
      price: { inputUsdPerMtok: "0.22", outputUsdPerMtok: "0.95" },
    });
    expect(toCreateTeamBody(draft({ pricingMode: "capacity" })).models?.[0]).not.toHaveProperty(
      "price",
    );
    expect(toCreateTeamBody(draft({ models: [] }))).not.toHaveProperty("models");
    expect(emptyEndpointDraft("team").location).toBe("in_namespace");
  });
});

describe("provider policy (screens 68, 68a; TC-UI-11)", () => {
  const off = { provider: "openrouter", reason: "", fallbackModel: "", selectForAllTeams: false };
  it("needs a reason, and for Bedrock a fallback selected for every team", () => {
    expect(providerOffBlock(off)).toBe("Enter a reason");
    expect(providerOffBlock({ ...off, reason: "policy" })).toBeUndefined();
    const b = { ...off, provider: "bedrock", reason: "policy" };
    expect(providerOffBlock(b)).toBe("Choose a fallback default model");
    expect(providerOffBlock({ ...b, fallbackModel: "azure-openai/chat-large" })).toContain(
      "every team",
    );
    expect(
      providerOffBlock({ ...b, fallbackModel: "azure-openai/chat-large", selectForAllTeams: true }),
    ).toBeUndefined();
  });
  it("offers callable route models on switched-on endpoints of providers that are on", () => {
    expect(
      fallbackCandidates([
        {
          slug: "azure-openai",
          enabled: true,
          provider: "azure",
          providerState: "on",
          models: [
            { modelName: "chat-large", enabled: true, callable: true },
            { modelName: "old", enabled: false },
            { modelName: "unpriced", enabled: true, callable: false },
          ],
        },
        {
          slug: "bedrock",
          enabled: true,
          provider: "bedrock",
          models: [{ modelName: "x", enabled: true }],
        },
        {
          slug: "vertex-ai",
          enabled: true,
          provider: "google",
          providerState: "off",
          models: [{ modelName: "g", enabled: true }],
        },
        { slug: "eval", enabled: false, provider: "other" },
        { slug: "plain", enabled: true, provider: "openai" },
      ]),
    ).toEqual(["azure-openai/chat-large"]);
  });
});

describe("CLI previews (WEB-6)", () => {
  it("renders create-model-endpoint with boolean pairs", () => {
    const text = renderCli(createModelEndpointCli(draft()));
    expect(text).toContain("afs model-endpoints create-model-endpoint");
    expect(text).toContain("--slug openrouter");
    expect(text).toContain("--protocols openai_chat");
    expect(text).toContain("--no-requires-terms");
    expect(text).toContain("--models '[");
  });
  it("renders the team endpoint, selections, gateway settings and enable commands", () => {
    expect(
      renderCli(createTeamModelEndpointCli("team_1", draft({ owner: "o", purpose: "p" }))),
    ).toContain("create-team-model-endpoint --team-id team_1");
    expect(renderCli(putTeamModelEndpointsCli("team_1", ["mep_1", "mep_2"]))).toBe(
      "afs teams put-team-model-endpoints --team-id team_1 --endpoint-ids mep_1 mep_2",
    );
    expect(
      renderCli(
        putTeamGatewaySettingsCli("team_1", {
          deployment: "per_namespace",
          mayAddModelEndpoints: true,
        }),
      ),
    ).toBe(
      "afs teams put-team-gateway-settings --team-id team_1 --deployment per_namespace --may-add-model-endpoints",
    );
    expect(renderCli(updateModelEndpointEnabledCli("mep_1", false))).toBe(
      "afs model-endpoints update-model-endpoint --endpoint-id mep_1 --no-enabled",
    );
  });
  it("never renders a credential value (TC-UI-06)", () => {
    expect(renderCli(putModelEndpointCredentialCli("mep_1", "team_1"))).toBe(
      "afs model-endpoints put-model-endpoint-credential --endpoint-id mep_1 --scope team_1 --secret-value file://<path>",
    );
    expect(renderCli(putTeamModelEndpointCredentialCli("team_1", "mep_1"))).toContain(
      "--secret-value file://<path>",
    );
  });
  it("renders federation and prices", () => {
    expect(
      renderCli(putEndpointFederationCli("mep_1", "team_1", { tenantId: "t", clientId: "" })),
    ).toBe(
      "afs model-endpoints put-endpoint-federation --endpoint-id mep_1 --team-id team_1 --tenant-id t",
    );
    expect(
      renderCli(
        createEndpointModelPriceCli("mep_1", {
          modelName: "m",
          inputUsdPerMtok: "1",
          outputUsdPerMtok: "2",
          effectiveFrom: "2026-12-01T00:00:00Z",
        }),
      ),
    ).toContain("--input-usd-per-mtok 1");
  });
  it("renders update-inference-provider as TC-CLI-05 spells it", () => {
    expect(
      renderCli(
        updateInferenceProviderCli("bedrock", {
          enabled: false,
          fallbackModel: "azure-openai/chat-large",
          selectForAllTeams: true,
          reason: "Enterprise policy",
        }),
      ),
    ).toBe(
      "afs model-endpoints update-inference-provider --provider bedrock --no-enabled --fallback-model azure-openai/chat-large --reason 'Enterprise policy' --select-for-all-teams",
    );
    expect(renderCli(updateInferenceProviderCli("google", { enabled: true }))).toBe(
      "afs model-endpoints update-inference-provider --provider google --enabled",
    );
  });
  it("renders the agent's routes as update-agent --models", () => {
    expect(
      renderCli(
        updateAgentRoutesCli("team_1", "agt_1", { routeAccess: "all", defaultRoute: null }),
      ),
    ).toBe(
      `afs agents update-agent --team-id team_1 --agent-id agt_1 --models '{"routeAccess":"all","defaultRoute":null}'`,
    );
  });
  it("gives route env names", () => {
    expect(routeBaseUrlEnv("ml-platform")).toBe("AFS_LLM_ML_PLATFORM_BASE_URL");
  });
});
