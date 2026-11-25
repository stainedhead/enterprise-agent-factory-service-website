// Model endpoints, provider policy, team routes and the inference report (API contract §4.13, 1.2.0).
// Generic model names only; no real credential, account or tenant value appears here.
import { TEAMS } from "./core.js";
import type { Fixture, FixtureContext, FixtureResponse } from "./index.js";

type Json = Record<string, unknown>;
const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const mep = (n: string) => `mep_${NS}00${n}`;
const PAYMENTS = TEAMS[0].id;
const PLATFORM = TEAMS[1].id;

export const ENDPOINT_IDS = {
  bedrock: mep("01"),
  openai: mep("02"),
  openrouter: mep("03"),
  mlPlatform: mep("04"),
  azure: mep("05"),
  evalSandbox: mep("06"),
  nous: mep("07"),
  coderVllm: mep("10"),
} as const;

const price = (input: string, output: string) => ({
  inputUsdPerMtok: input,
  outputUsdPerMtok: output,
});
const model = (modelName: string, p?: [string, string], over: Json = {}): Json => ({
  modelName,
  maxOutputTokens: 8192,
  contextTokens: 128000,
  enabled: true,
  callable: p !== undefined,
  priceState: p ? "approved" : "none",
  price: p ? price(p[0], p[1]) : null,
  ...over,
});
const ready = { state: "Ready", reason: null, since: ts };

const base = (over: Json): Json => ({
  teamId: null,
  protocols: ["openai_chat"],
  location: "external",
  authKind: "bearer",
  credentialMode: "per_team",
  pricingMode: "per_token",
  requiresTerms: false,
  enabled: true,
  providerState: "on",
  metered: true,
  capped: true,
  health: ready,
  models: [],
  teamsSelected: 0,
  createdAt: ts,
  createdBy: "svc-admin",
  version: 1,
  ...over,
});

const seedEndpoints = (): Json[] => [
  base({
    id: ENDPOINT_IDS.bedrock,
    slug: "bedrock",
    displayName: "Amazon Bedrock",
    provider: "bedrock",
    builtin: true,
    baseUrl: "https://bedrock-runtime.vpce.example.test",
    authKind: "none",
    credentialMode: "shared",
    teamsSelected: 2,
    models: [model("chat-large", ["3.00", "15.00"]), model("chat-small", ["1.00", "5.00"])],
  }),
  base({
    id: ENDPOINT_IDS.openai,
    slug: "openai-prod",
    displayName: "OpenAI",
    provider: "openai",
    baseUrl: "https://api.openai.example.test/v1",
    protocols: ["openai_chat", "openai_responses", "openai_embeddings"],
    teamsSelected: 1,
    models: [
      model("gpt-large", ["2.00", "8.00"]),
      model("gpt-small", ["0.40", "1.60"]),
      model("embed-small"),
    ],
  }),
  base({
    id: ENDPOINT_IDS.openrouter,
    slug: "openrouter",
    displayName: "OpenRouter",
    provider: "openrouter",
    baseUrl: "https://openrouter.example.test/api/v1",
    requiresTerms: true,
    teamsSelected: 1,
    models: [model("router-auto", ["1.00", "4.00"])],
  }),
  base({
    id: ENDPOINT_IDS.mlPlatform,
    slug: "ml-platform",
    displayName: "Enterprise ML platform",
    provider: "internal",
    location: "corporate",
    baseUrl: "https://ml.corp.example.test/v1",
    protocols: ["openai_chat", "openai_embeddings"],
    credentialMode: "shared",
    teamsSelected: 1,
    health: {
      state: "Degraded",
      reason: "p95 time to first token is 7.8 s over the last 15 minutes (objective 5 s).",
      since: ts,
    },
    models: [model("corp-chat", ["0.50", "1.50"])],
  }),
  base({
    id: ENDPOINT_IDS.azure,
    slug: "azure-openai",
    displayName: "Azure OpenAI",
    provider: "azure",
    baseUrl: "https://example-resource.openai.azure.example.test/openai/v1",
    authKind: "azure_federated",
    requiresTerms: true,
    providerState: "off",
    health: { state: "Unknown", reason: null, since: ts },
    models: [model("azure-chat", ["2.00", "8.00"])],
  }),
  base({
    id: ENDPOINT_IDS.nous,
    slug: "nous-portal",
    displayName: "Nous Portal",
    provider: "nous",
    baseUrl: "https://inference.nous.example.test/v1",
    models: [model("open-chat", ["0.30", "0.90"])],
  }),
  base({
    id: ENDPOINT_IDS.evalSandbox,
    slug: "eval-sandbox",
    displayName: "Evaluation sandbox",
    provider: "internal",
    location: "corporate",
    baseUrl: "https://eval.corp.example.test/v1",
    authKind: "none",
    pricingMode: "free",
    capped: false,
    enabled: false,
    health: { state: "Unknown", reason: null, since: ts },
    models: [model("eval-chat", undefined, { priceState: "not_required", callable: true })],
  }),
  base({
    id: ENDPOINT_IDS.coderVllm,
    slug: "coder-vllm",
    displayName: "Coder (vLLM)",
    teamId: PAYMENTS,
    provider: "other",
    location: "in_namespace",
    baseUrl: "http://vllm-coder:8000/v1",
    authKind: "none",
    pricingMode: "capacity",
    capped: false,
    owner: "Marcus Chen",
    purpose: "Code completion for the review agents",
    models: [model("coder-30b", undefined, { priceState: "not_required", callable: true })],
  }),
];

const PROVIDERS: [string, string, string[], "team_admin" | "service_admin", boolean][] = [
  ["bedrock", "Amazon Bedrock", ["Bedrock runtime (VPC endpoints)"], "team_admin", true],
  ["openai", "OpenAI", ["api.openai.example.test"], "team_admin", true],
  ["openrouter", "OpenRouter", ["openrouter.example.test"], "team_admin", true],
  ["nous", "Nous Portal", ["inference.nous.example.test"], "team_admin", true],
  ["opencode", "OpenCode Console", ["opencode.example.test"], "team_admin", true],
  ["azure", "Azure", ["*.openai.azure.example.test"], "service_admin", false],
  ["google", "Google", ["*aiplatform.example.test"], "service_admin", false],
  ["other", "Other external hosts", ["any external host not listed"], "team_admin", true],
];
const seedProviders = (): Json[] =>
  PROVIDERS.map(([provider, displayName, hosts, teamSelection, enabled]) => ({
    provider,
    displayName,
    hosts,
    enabled,
    teamSelection,
    routes: provider === "bedrock" ? 1 : enabled ? 1 : provider === "azure" ? 1 : 0,
    teams:
      provider === "bedrock"
        ? 2
        : enabled && provider !== "nous" && provider !== "opencode"
          ? 1
          : 0,
    directSystems: 0,
    disabledReason: enabled ? null : "Off by default on a new install",
    fallbackModel: null,
    changedAt: ts,
    changedBy: "svc-admin",
    version: 1,
  }));

const seedProposals = (): Json[] => [
  {
    id: `epp_${NS}0001`,
    endpointId: ENDPOINT_IDS.openai,
    slug: "openai-prod",
    modelName: "gpt-large",
    effectiveFrom: "2026-12-01T00:00:00Z",
    fetchedAt: "2026-11-21T02:00:00Z",
    inputUsdPerMtok: "1.75",
    outputUsdPerMtok: "7.00",
    source: "price_list",
    status: "pending",
    version: 1,
  },
];

interface TeamState {
  selected: Map<string, "team_admin" | "service_admin">;
  deployment: "shared" | "per_namespace";
  mayAdd: boolean;
  version: number;
}
const seedTeams = (): Map<string, TeamState> =>
  new Map([
    [
      PAYMENTS,
      {
        selected: new Map([
          [ENDPOINT_IDS.bedrock, "service_admin"],
          [ENDPOINT_IDS.openai, "team_admin"],
          [ENDPOINT_IDS.mlPlatform, "team_admin"],
          [ENDPOINT_IDS.openrouter, "service_admin"],
        ]),
        deployment: "per_namespace",
        mayAdd: true,
        version: 1,
      },
    ],
    [
      PLATFORM,
      {
        selected: new Map([[ENDPOINT_IDS.bedrock, "service_admin"]]),
        deployment: "shared",
        mayAdd: false,
        version: 1,
      },
    ],
  ]);

let endpoints = seedEndpoints();
let providers = seedProviders();
let proposals = seedProposals();
let teams = seedTeams();
let created = 0;
export const resetModelEndpoints = (): void => {
  endpoints = seedEndpoints();
  providers = seedProviders();
  proposals = seedProposals();
  teams = seedTeams();
  created = 0;
};

const err = (status: number, code: string, message: string, reason?: string): FixtureResponse => ({
  status,
  body: {
    code,
    message,
    requestId: `req_fake_${status}`,
    ...(reason ? { details: { reason } } : {}),
  },
});
const notFound = (what: string) => err(404, "NotFound", `${what} not found`);
const bump = (e: Json, over: Json): Json => ({
  ...e,
  ...over,
  version: Number(e.version) + 1,
  updatedAt: "2026-11-25T10:00:00Z",
});
const find = (id: string | undefined) => endpoints.findIndex((e) => e.id === id);
const teamOf = (id: string | undefined): TeamState | undefined => teams.get(id ?? "");
const providerOn = (provider: string) =>
  providers.find((p) => p.provider === provider)?.enabled !== false;

const SLUG = /^[a-z][a-z0-9-]{1,30}$/;
/** The create checks both create operations share (contract §4.13 refusals). */
function checkCreate(b: Json, teamId: string | null): FixtureResponse | undefined {
  const slug = String(b.slug ?? "");
  if (slug === "bedrock")
    return err(
      400,
      "ValidationError",
      "bedrock is reserved for the built-in route",
      "slug_reserved",
    );
  if (!SLUG.test(slug)) return err(400, "ValidationError", "Invalid route name", "slug_invalid");
  if (endpoints.some((e) => e.slug === slug && (e.teamId === null || e.teamId === teamId)))
    return err(409, "Conflict", `The route name ${slug} is already used`, "slug_taken");
  const url = String(b.baseUrl ?? "");
  if (b.location !== "in_namespace" && !url.startsWith("https://"))
    return err(
      400,
      "ValidationError",
      "External and corporate endpoints need https",
      "base_url_not_https",
    );
  if (url.includes("<"))
    return err(
      400,
      "ValidationError",
      "The base URL holds a placeholder",
      "endpoint_base_url_placeholder",
    );
  if (typeof b.provider === "string" && !providerOn(b.provider))
    return err(
      403,
      "AccessDenied",
      "This provider is switched off by provider policy",
      "provider_disabled",
    );
  return undefined;
}

const inputModels = (b: Json): Json[] =>
  ((b.models as Json[] | undefined) ?? []).map((m) => {
    const p = m.price as Json | undefined;
    const free = b.pricingMode !== "per_token";
    return model(
      String(m.modelName),
      p ? [String(p.inputUsdPerMtok), String(p.outputUsdPerMtok)] : undefined,
      {
        maxOutputTokens: Number(m.maxOutputTokens ?? 4096),
        ...(free && { priceState: "not_required", callable: true }),
      },
    );
  });

/** A team's view of one endpoint (`TeamModelEndpoint`). */
function teamView(teamId: string, e: Json, t: TeamState): Json {
  const own = e.teamId === teamId;
  const by = t.selected.get(String(e.id));
  const relation = own ? "own" : by ? "selected" : "available";
  const offReason =
    e.providerState === "off"
      ? "provider_disabled"
      : !e.enabled
        ? "endpoint_disabled"
        : relation === "available"
          ? "not_selected"
          : null;
  const federated = String(e.authKind).endsWith("_federated");
  return {
    id: e.id,
    teamId: e.teamId,
    slug: e.slug,
    displayName: e.displayName,
    provider: e.provider,
    protocols: e.protocols,
    location: e.location,
    pricingMode: e.pricingMode,
    enabled: e.enabled,
    relation,
    selectableBy:
      e.requiresTerms || e.provider === "azure" || e.provider === "google"
        ? "service_admin"
        : "team_admin",
    selectedBy: own ? null : (by ?? null),
    authKind: e.authKind,
    credentialMode: e.credentialMode,
    credentialState:
      e.authKind === "none" || e.provider === "bedrock" || federated
        ? "not_required"
        : e.credentialMode === "shared" || e.slug === "openai-prod"
          ? "set"
          : "missing",
    federationState: federated ? "pending" : "not_required",
    providerState: e.providerState,
    offReason,
    baseUrl: own ? e.baseUrl : null,
    baseUrlEnv: `AFS_LLM_${String(e.slug).toUpperCase().replace(/-/g, "_")}_BASE_URL`,
    requiresTerms: e.requiresTerms,
    metered: e.metered,
    capped: e.capped,
    owner: own ? (e.owner ?? null) : null,
    purpose: own ? (e.purpose ?? null) : null,
    health: e.health,
    models: e.models,
    version: e.version,
  };
}

const ROUTE_ROWS: [string, string, number, number, string, number, number][] = [
  // route, pricingMode, calls, errors, cost, p95 ms, ttft p95 ms
  ["bedrock", "bedrock", 3412, 7, "212.40", 4100, 900],
  ["openai-prod", "per_token", 1906, 4, "48.10", 2600, 700],
  ["ml-platform", "per_token", 640, 9, "17.40", 9800, 7800],
  ["openrouter", "per_token", 120, 1, "5.80", 3100, 1100],
  ["coder-vllm", "capacity", 4880, 12, "9.20", 1800, 300],
];
function inference(ctx: FixtureContext, teamId: string | undefined): FixtureResponse {
  const groupBy = (ctx.query.get("groupBy") ?? "route").split(",");
  const route = ctx.query.get("route");
  const team = teamId ?? ctx.query.get("teamId") ?? undefined;
  const scale = team === PLATFORM ? 0.1 : 1;
  const src = ROUTE_ROWS.filter(
    ([r]) => (!route || r === route) && (team !== PLATFORM || r === "bedrock"),
  );
  const rows = src.map(([r, pricingMode, calls, errors, cost, p95, ttft], n) => {
    const c = Math.round(calls * scale);
    const row: Json = {
      calls: c,
      errors: Math.round(errors * scale),
      errorRatePct: Math.round((errors / calls) * 1000) / 10,
      inputTokens: c * 2100,
      outputTokens: c * 420,
      costUsd: (Number(cost) * scale).toFixed(2),
      effectiveUsdPerMtok: pricingMode === "capacity" ? null : "2.10",
      latencyP50Ms: Math.round(p95 / 2),
      latencyP95Ms: p95,
      ttftP95Ms: ttft,
      outputTokensPerSecond: 80 - n * 5,
      gatewayP99Ms: 9,
      pricingMode,
      estimatedPct: pricingMode === "capacity" ? 100 : 0,
    };
    for (const g of groupBy) {
      if (g === "route") row.route = r;
      if (g === "model") row.model = r === "coder-vllm" ? "coder-30b" : "chat-large";
      if (g === "team") row.teamId = team ?? PAYMENTS;
      if (g === "agent") row.agentId = `agt_${NS}000${(n % 3) + 1}`;
      if (g === "day") row.day = `2026-11-${String(20 + n).padStart(2, "0")}`;
      if (g === "hour") row.hour = `2026-11-25T0${n}:00:00Z`;
    }
    return row;
  });
  const sum = (k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const body = {
    range: { from: "2026-11-01T00:00:00Z", to: "2026-11-25T00:00:00Z" },
    groupBy,
    rows,
    totals: {
      calls: sum("calls"),
      errors: sum("errors"),
      inputTokens: sum("inputTokens"),
      outputTokens: sum("outputTokens"),
      costUsd: sum("costUsd").toFixed(2),
      latencyP95Ms: 4100,
    },
    notes: [
      "Capacity routes are allocated EKS cost, estimated until the daily cost reconciliation.",
    ],
  };
  const csv = [
    [...groupBy, "calls", "errors", "costUsd"].join(","),
    ...rows.map((r) =>
      [
        ...groupBy.map((g) =>
          String(r[g === "agent" ? "agentId" : g === "team" ? "teamId" : g] ?? ""),
        ),
        r.calls,
        r.errors,
        r.costUsd,
      ].join(","),
    ),
  ].join("\n");
  return { status: 200, body, csv: `${csv}\n` };
}

export const modelEndpointsFixtures: readonly Fixture[] = [
  // ---- service catalog (admin:model-endpoints)
  {
    method: "GET",
    path: "/v1/admin/model-endpoints",
    response: ({ query }) => ({
      status: 200,
      body: {
        items: endpoints.filter((e) => query.get("includeTeams") === "true" || e.teamId === null),
      },
    }),
  },
  {
    method: "POST",
    path: "/v1/admin/model-endpoints",
    response: ({ body }) => {
      const b = body as Json;
      const refused = checkCreate(b, null);
      if (refused) return refused;
      created += 1;
      const e = base({
        ...b,
        id: mep(String(20 + created)),
        enabled: false,
        capped: b.pricingMode === "per_token",
        health: { state: "Unknown", reason: null, since: null },
        models: inputModels(b),
      });
      endpoints.push(e);
      return { status: 201, body: e };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/model-endpoints/{endpointId}",
    response: ({ params }) => {
      const e = endpoints[find(params.endpointId)];
      return e ? { status: 200, body: e } : notFound("Endpoint");
    },
  },
  {
    method: "PATCH",
    path: "/v1/admin/model-endpoints/{endpointId}",
    response: ({ params, body }) => {
      const i = find(params.endpointId);
      const e = endpoints[i];
      if (!e) return notFound("Endpoint");
      const next = bump(e, body as Json);
      endpoints[i] = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/admin/model-endpoints/{endpointId}",
    response: ({ params }) => {
      const i = find(params.endpointId);
      const e = endpoints[i];
      if (!e) return notFound("Endpoint");
      if (e.enabled)
        return err(409, "Conflict", "Turn the endpoint off before deleting it", "endpoint_enabled");
      endpoints.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "POST",
    path: "/v1/admin/model-endpoints/{endpointId}/prices",
    response: ({ params, body }) => {
      const i = find(params.endpointId);
      const e = endpoints[i];
      if (!e) return notFound("Endpoint");
      const b = body as Json;
      endpoints[i] = {
        ...e,
        models: ((e.models as Json[]) ?? []).map((m) =>
          m.modelName === b.modelName
            ? {
                ...m,
                callable: true,
                priceState: "approved",
                price: price(String(b.inputUsdPerMtok), String(b.outputUsdPerMtok)),
              }
            : m,
        ),
      };
      return {
        status: 201,
        body: {
          endpointId: e.id,
          modelName: b.modelName,
          effectiveFrom: b.effectiveFrom,
          inputUsdPerMtok: b.inputUsdPerMtok,
          outputUsdPerMtok: b.outputUsdPerMtok,
          source: "manual",
          createdAt: "2026-11-25T10:00:00Z",
        },
      };
    },
  },
  {
    method: "GET",
    path: "/v1/admin/model-endpoints/{endpointId}/teams",
    response: ({ params }) => {
      const e = endpoints[find(params.endpointId)];
      if (!e) return notFound("Endpoint");
      const federated = String(e.authKind).endsWith("_federated");
      return {
        status: 200,
        body: {
          items: TEAMS.map((t) => {
            const st = teams.get(t.id);
            const v = st ? teamView(t.id, e, st) : undefined;
            return {
              teamId: t.id,
              teamSlug: t.slug,
              teamDisplayName: t.displayName,
              selected: v?.relation === "selected" || v?.relation === "own",
              selectedBy: v?.selectedBy ?? null,
              credentialState: v?.credentialState ?? "missing",
              credentialRotatedAt: v?.credentialState === "set" ? ts : null,
              federationState: federated ? "pending" : "not_required",
              gatewayDeployment: st?.deployment ?? "shared",
              gatewayVersion: st?.deployment === "per_namespace" ? "v1.2.0" : null,
              spendMtdUsd:
                v?.relation === "selected" ? (t.id === PAYMENTS ? "48.10" : "4.81") : "0.00",
              health: e.health,
            };
          }),
        },
      };
    },
  },
  {
    method: "PUT",
    path: "/v1/admin/model-endpoints/{endpointId}/credentials/{scope}",
    response: ({ params }) =>
      endpoints[find(params.endpointId)]
        ? {
            status: 200,
            body: {
              endpointId: params.endpointId,
              scope: params.scope,
              state: "set",
              rotatedAt: null,
            },
          }
        : notFound("Endpoint"),
  },
  {
    method: "POST",
    path: "/v1/admin/model-endpoints/{endpointId}/credentials/{scope}:rotate",
    response: ({ params }) =>
      endpoints[find(params.endpointId)]
        ? {
            status: 200,
            body: {
              endpointId: params.endpointId,
              scope: params.scope,
              state: "set",
              rotatedAt: "2026-11-25T10:00:00Z",
            },
          }
        : notFound("Endpoint"),
  },
  {
    method: "PUT",
    path: "/v1/admin/model-endpoints/{endpointId}/federations/{teamId}",
    response: ({ params, body }) => {
      const e = endpoints[find(params.endpointId)];
      if (!e) return notFound("Endpoint");
      return {
        status: 200,
        body: {
          endpointId: e.id,
          teamId: params.teamId,
          kind: e.authKind === "google_federated" ? "google" : "azure",
          status: "pending",
          lastError: null,
          ...(body as Json),
          version: 1,
        },
      };
    },
  },
  // ---- price proposals (admin:pricing)
  {
    method: "GET",
    path: "/v1/admin/endpoint-price-proposals",
    response: ({ query }) => ({
      status: 200,
      body: {
        items: proposals.filter((p) => !query.get("status") || p.status === query.get("status")),
      },
    }),
  },
  ...(["approve", "reject"] as const).map(
    (verb): Fixture => ({
      method: "POST",
      path: `/v1/admin/endpoint-price-proposals/{proposalId}:${verb}`,
      response: ({ params, body }) => {
        const i = proposals.findIndex((p) => p.id === params.proposalId);
        const cur = proposals[i];
        if (!cur) return notFound("Proposal");
        if (cur.status !== "pending") return err(409, "Conflict", "Proposal already decided");
        const note = (body as Json | undefined)?.note;
        const next = {
          ...cur,
          status: verb === "approve" ? "approved" : "rejected",
          decidedAt: "2026-11-25T10:00:00Z",
          decidedBy: "usr_svc-admin",
          ...(note ? { note } : {}),
          version: Number(cur.version) + 1,
        };
        proposals[i] = next;
        return { status: 200, body: next };
      },
    }),
  ),
  // ---- provider policy
  {
    method: "GET",
    path: "/v1/admin/inference-providers",
    response: () => ({ status: 200, body: { items: providers } }),
  },
  {
    method: "PATCH",
    path: "/v1/admin/inference-providers/{provider}",
    response: ({ params, body, query }) => {
      const i = providers.findIndex((p) => p.provider === params.provider);
      const cur = providers[i];
      if (!cur) return notFound("Provider");
      const b = body as Json;
      const bedrock = cur.provider === "bedrock";
      const off = b.enabled === false;
      if (bedrock && off && (!b.fallbackModel || b.selectForAllTeams !== true))
        return err(
          400,
          "ValidationError",
          "Choose a fallback route model and select it for every team",
          "no_fallback_model",
        );
      const routes = endpoints.filter((e) => e.provider === cur.provider && e.teamId === null);
      const impact = {
        routes: routes.length,
        teams: Number(cur.teams),
        agents: bedrock ? 3 : off ? 1 : 0,
        agentsDegraded: off && !bedrock ? 1 : 0,
        agentsMovingToFallback: bedrock && off ? 2 : 0,
        directSystems: 0,
        teamsToSelect: bedrock && off ? 1 : 0,
        fallbackModel: (b.fallbackModel as string | undefined) ?? null,
      };
      if (query.get("dryRun") === "true") return { status: 200, body: { ...cur, impact } };
      const next = {
        ...cur,
        enabled: b.enabled,
        disabledReason: off ? (b.reason ?? null) : null,
        fallbackModel: bedrock && off ? b.fallbackModel : null,
        changedAt: "2026-11-25T10:00:00Z",
        changedBy: "svc-admin",
        version: Number(cur.version) + 1,
      };
      providers[i] = next;
      endpoints = endpoints.map((e) =>
        e.provider === cur.provider ? { ...e, providerState: off ? "off" : "on" } : e,
      );
      return { status: 200, body: { ...next, impact } };
    },
  },
  {
    method: "PUT",
    path: "/v1/admin/teams/{teamId}/gateway-settings",
    response: ({ params, body }) => {
      const t = teamOf(params.teamId);
      if (!t) return notFound("Team");
      const b = body as Json;
      t.deployment = b.deployment === "per_namespace" ? "per_namespace" : "shared";
      t.mayAdd = b.mayAddModelEndpoints === true;
      t.version += 1;
      return {
        status: 200,
        body: {
          teamId: params.teamId,
          deployment: t.deployment,
          mayAddModelEndpoints: t.mayAdd,
          gatewayState: t.deployment === "per_namespace" ? "provisioning" : "shared",
          gatewayUrl: null,
          version: t.version,
        },
      };
    },
  },
  // ---- a team's routes
  {
    method: "GET",
    path: "/v1/teams/{teamId}/model-endpoints",
    response: ({ params }) => {
      const teamId = params.teamId ?? "";
      const t = teamOf(teamId);
      if (!t) return notFound("Team");
      const items = endpoints
        .filter(
          (e) =>
            (e.teamId === null && (e.enabled || t.selected.has(String(e.id)))) ||
            e.teamId === teamId,
        )
        .map((e) => teamView(teamId, e, t));
      return {
        status: 200,
        body: { items, gatewayDeployment: t.deployment, mayAddModelEndpoints: t.mayAdd },
      };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/model-endpoint-selections",
    response: ({ params, body, principal }) => {
      const t = teamOf(params.teamId);
      if (!t) return notFound("Team");
      const ids = ((body as Json).endpointIds as string[] | undefined) ?? [];
      const svc = principal?.id === "svc-admin";
      const next = new Map<string, "team_admin" | "service_admin">();
      for (const id of ids) {
        const e = endpoints.find((x) => x.id === id && x.teamId === null);
        if (!e) return err(400, "ValidationError", `Unknown endpoint ${id}`);
        const was = t.selected.get(id);
        const needsSvc =
          e.requiresTerms === true || e.provider === "azure" || e.provider === "google";
        if (!was && needsSvc && !svc)
          return err(
            403,
            "AccessDenied",
            "This endpoint is selected by a service admin",
            "needs_service_admin",
          );
        next.set(id, was ?? (svc ? "service_admin" : "team_admin"));
      }
      for (const [id, by] of t.selected)
        if (!next.has(id) && by === "service_admin" && !svc && id !== ENDPOINT_IDS.bedrock)
          return err(
            403,
            "AccessDenied",
            "A service admin removes this endpoint",
            "needs_service_admin",
          );
      t.selected = next;
      return {
        status: 200,
        body: {
          teamId: params.teamId,
          endpointIds: [...next.keys()],
          selections: [...next].map(([endpointId, selectedBy]) => ({
            endpointId,
            slug: endpoints.find((e) => e.id === endpointId)?.slug,
            selectedBy,
          })),
        },
      };
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/model-endpoints",
    response: ({ params, body }) => {
      const teamId = params.teamId ?? "";
      const t = teamOf(teamId);
      if (!t) return notFound("Team");
      if (!t.mayAdd)
        return err(
          403,
          "AccessDenied",
          "The team may not declare its own endpoints",
          "team_endpoints_not_allowed",
        );
      const b = body as Json;
      const refused = checkCreate(b, teamId);
      if (refused) return refused;
      created += 1;
      const e = base({
        ...b,
        id: mep(String(30 + created)),
        teamId,
        provider: b.location === "external" ? "other" : "internal",
        credentialMode: "per_team",
        capped: b.pricingMode === "per_token",
        health: { state: "Unknown", reason: null, since: null },
        models: inputModels(b),
      });
      endpoints.push(e);
      return { status: 201, body: e };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/model-endpoints/{endpointId}",
    response: ({ params }) => {
      const i = endpoints.findIndex(
        (e) => e.id === params.endpointId && e.teamId === params.teamId,
      );
      if (i < 0) return notFound("Endpoint");
      endpoints.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/model-endpoints/{endpointId}/credential",
    response: ({ params }) =>
      endpoints[find(params.endpointId)]
        ? {
            status: 200,
            body: {
              endpointId: params.endpointId,
              scope: params.teamId,
              state: "set",
              rotatedAt: null,
            },
          }
        : notFound("Endpoint"),
  },
  // ---- inference report
  { method: "GET", path: "/v1/reports/inference", response: (ctx) => inference(ctx, undefined) },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/reports/inference",
    response: (ctx) => inference(ctx, ctx.params.teamId),
  },
];
