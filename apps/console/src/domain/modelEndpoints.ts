// Pure model-endpoint rules (root PRD §7 to §9, API contract §4.13): the words and badges of a route, the
// environment an agent receives (gateway contract §8.2), form checks, the provider-off readiness of screen 68a
// and the `afs` commands of every create and change form.
import { BARE_FLAG, boolFlag, buildCli, type CliCommand, type CliValue } from "./cli.js";
import type { Dot, PhaseView } from "./status.js";

export type PricingMode = "per_token" | "capacity" | "free";
export type EndpointLocation = "external" | "corporate" | "in_namespace";
export type EndpointProtocol = "openai_chat" | "openai_responses" | "openai_embeddings";
export type AuthKind = "none" | "bearer" | "header" | "azure_federated" | "google_federated";

/** The built-in Bedrock route; reserved as a slug. */
export const BEDROCK_ROUTE = "bedrock";

const SLUG = /^[a-z][a-z0-9-]{1,30}$/;

/** `AFS_LLM_<ROUTE>_BASE_URL` for a route name (gateway contract §8.2). */
export function routeBaseUrlEnv(route: string): string {
  return `AFS_LLM_${route.toUpperCase().replace(/-/g, "_")}_BASE_URL`;
}

export const LOCATION_WORDS: Record<string, string> = {
  external: "External",
  corporate: "Corporate",
  in_namespace: "In namespace",
};
export const locationWord = (l: string): string => LOCATION_WORDS[l] ?? l;

export const PRICING_WORDS: Record<string, string> = {
  per_token: "Per token",
  capacity: "Capacity",
  free: "Free",
};
export const pricingWord = (m: string): string => PRICING_WORDS[m] ?? m;

const PROTOCOL_WORDS: Record<string, string> = {
  openai_chat: "Chat",
  openai_responses: "Responses",
  openai_embeddings: "Embeddings",
};
/** `Chat, Responses, Embeddings`. */
export const protocolWords = (ps: readonly string[]): string =>
  ps.map((p) => PROTOCOL_WORDS[p] ?? p).join(", ");

const AUTH_WORDS: Record<string, string> = {
  none: "None",
  bearer: "API key (bearer)",
  header: "API key (header)",
  azure_federated: "Workload identity federation (Azure)",
  google_federated: "Workload identity federation (Google)",
};
export const authWord = (k: string): string => AUTH_WORDS[k] ?? k;

/** A route's badges in the order of the mockups: Built-in, Metered, Capped, Extra terms. */
export function badgesOf(e: {
  readonly builtin?: boolean | undefined;
  readonly pricingMode: string;
  readonly requiresTerms?: boolean | undefined;
  readonly metered?: boolean | undefined;
  readonly capped?: boolean | undefined;
}): string[] {
  const out: string[] = [];
  if (e.builtin) out.push("Built-in");
  if (e.metered !== false) out.push("Metered");
  if (e.capped ?? e.pricingMode === "per_token") out.push("Capped");
  if (e.requiresTerms) out.push("Extra terms");
  return out;
}

/** What counts against the team's hard cap (screen 65): per-token routes and Bedrock are capped. */
export const capWord = (pricingMode: string): "Capped" | "Reported only" =>
  pricingMode === "per_token" || pricingMode === "bedrock" ? "Capped" : "Reported only";

const HEALTH: Record<string, PhaseView> = {
  Ready: { word: "Healthy", dot: "green" },
  Degraded: { word: "Degraded", dot: "amber" },
  Unavailable: { word: "Unavailable", dot: "red" },
  Unknown: { word: "Unknown", dot: "grey" },
};
/** Route health (PRD §10.4); a provider that is off shows *Provider off*. */
export function healthView(state: string | undefined, providerOff = false): PhaseView {
  if (providerOff) return { word: "Provider off", dot: "grey" };
  return HEALTH[state ?? "Unknown"] ?? { word: state ?? "Unknown", dot: "grey" };
}

/** The service switch of an endpoint, with the provider policy first (PRD §7.4). */
export function serviceStateView(e: {
  readonly enabled: boolean;
  readonly providerState?: string | undefined;
}): PhaseView {
  if (e.providerState === "off") return { word: "Off by provider policy", dot: "red" };
  return e.enabled ? { word: "On", dot: "green" } : { word: "Off", dot: "grey" };
}

/** A provider switch (screen 68). */
export const providerStateView = (enabled: boolean): PhaseView =>
  enabled ? { word: "On", dot: "green" } : { word: "Off", dot: "grey" };

const CREDENTIAL: Record<string, PhaseView> = {
  set: { word: "Set", dot: "green" },
  missing: { word: "Missing", dot: "red" },
  not_required: { word: "Not required", dot: "grey" },
};
/** Credential metadata only: *Set*, *Missing* or *Not required*; there is never a value to show. */
export const credentialView = (state: string): PhaseView =>
  CREDENTIAL[state] ?? { word: state, dot: "grey" };

const FEDERATION: Record<string, PhaseView> = {
  ready: { word: "Ready", dot: "green" },
  pending: { word: "Pending", dot: "blue" },
  failing: { word: "Failing", dot: "red" },
  not_required: { word: "Not required", dot: "grey" },
};
export const federationView = (state: string): PhaseView =>
  FEDERATION[state] ?? { word: state, dot: "grey" };

/** Why a route does not reach the team's agents (`offReason` of `ListTeamModelEndpoints`). */
export const OFF_REASON_TEXT: Record<string, string> = {
  provider_disabled: "Off by provider policy",
  endpoint_disabled: "Switched off by a service admin",
  not_selected: "Not added to the team",
  credential_missing: "Missing credential",
  federation_not_ready: "Federation not ready",
};
export const offReasonText = (r: string | null | undefined): string | undefined =>
  r ? (OFF_REASON_TEXT[r] ?? r) : undefined;

/** Who selects an endpoint for a team, in the mockups' words. */
export const selectedByWord = (s: string | null | undefined): string =>
  s === "service_admin" ? "Service admin" : s === "team_admin" ? "Team-admin" : "—";

/** The disabled reason of *Add service endpoint* for one endpoint, or undefined when the caller may add it. */
export function optInBlock(
  e: { readonly selectableBy: string },
  callerIsServiceAdmin: boolean,
): string | undefined {
  return e.selectableBy === "service_admin" && !callerIsServiceAdmin
    ? "Needs a service admin"
    : undefined;
}

/** The text a team-admin sees on *Create endpoint* when the team may not declare endpoints (US-66). */
export const TEAM_ENDPOINTS_NOT_ALLOWED = "Needs permission from a service admin";

// ---------------------------------------------------------------------------------------------------------------
// Agent routes and the environment it receives (gateway contract §8.2)

export type RouteAccess = "all" | "selected";

export interface RouteChoice {
  readonly slug: string;
  readonly protocols: readonly string[];
  readonly models: readonly string[];
}

export interface AgentRoutesSpec {
  readonly routeAccess: RouteAccess;
  readonly routes: readonly string[];
  /** Empty when the agent has no default route. */
  readonly defaultRoute: string;
  readonly defaultModel: string;
}

/** The routes an agent can call within the team's set: `all` follows the team; `selected` narrows it. */
export function effectiveRoutes(spec: AgentRoutesSpec, team: readonly string[]): string[] {
  const set = spec.routeAccess === "all" ? [...team] : spec.routes.filter((r) => team.includes(r));
  const sorted = [...set].sort();
  if (spec.defaultRoute && sorted.includes(spec.defaultRoute))
    return [spec.defaultRoute, ...sorted.filter((r) => r !== spec.defaultRoute)];
  return sorted;
}

export interface RoutesErrors {
  routes?: string;
  defaultRoute?: string;
  defaultModel?: string;
}

/** Client checks (the API repeats them): a selection, a default route the agent has, a model on it. */
export function validateRoutes(spec: AgentRoutesSpec, team: readonly RouteChoice[]): RoutesErrors {
  const e: RoutesErrors = {};
  const eff = effectiveRoutes(
    spec,
    team.map((t) => t.slug),
  );
  if (spec.routeAccess === "selected" && spec.routes.length === 0)
    e.routes = "Choose at least one route, or All team routes";
  if (spec.defaultRoute) {
    if (!eff.includes(spec.defaultRoute))
      e.defaultRoute = "The default route must be one of the agent's routes";
    else {
      const models = team.find((t) => t.slug === spec.defaultRoute)?.models ?? [];
      if (!spec.defaultModel) e.defaultModel = "Choose the default model on that route";
      else if (!models.includes(spec.defaultModel))
        e.defaultModel = "The model is not served on that route";
    }
  }
  return e;
}

/** One line of *What the agent receives*: a variable, its value, and an optional comment. */
export interface EnvLine {
  readonly name: string;
  readonly value: string;
  readonly comment?: string;
}

/**
 * The environment an agent receives on its next restart for the routes chosen (gateway contract §8.2): the route
 * list with the default first, the default route and model, one base URL per route, and `OPENAI_BASE_URL` /
 * `OPENAI_API_KEY` (the `afs-gateway` placeholder) for a default route unless the agent sets `OPENAI_BASE_URL` itself.
 * No value here is a secret.
 */
export function routeEnvPreview(
  spec: AgentRoutesSpec,
  team: readonly string[],
  opts: {
    readonly gatewayUrl?: string | null | undefined;
    readonly ownOpenAiBaseUrl?: boolean;
  } = {},
): EnvLine[] {
  const routes = effectiveRoutes(spec, team);
  const lines: EnvLine[] = [];
  lines.push({ name: "AFS_GATEWAY_URL", value: opts.gatewayUrl ?? "<team gateway URL>" });
  if (routes.length === 0) return lines;
  lines.push({ name: "AFS_LLM_ROUTES", value: routes.join(",") });
  const hasDefault = spec.defaultRoute !== "" && routes.includes(spec.defaultRoute);
  if (hasDefault) {
    lines.push({ name: "AFS_LLM_DEFAULT_ROUTE", value: spec.defaultRoute });
    if (spec.defaultModel) lines.push({ name: "AFS_LLM_DEFAULT_MODEL", value: spec.defaultModel });
  }
  for (const r of routes)
    lines.push({
      name: routeBaseUrlEnv(r),
      value: `\${AFS_GATEWAY_URL}/r/${r}/v1`,
      ...(r === BEDROCK_ROUTE && { comment: "OpenAI protocol → Converse" }),
    });
  if (hasDefault && !opts.ownOpenAiBaseUrl) {
    lines.push({ name: "OPENAI_BASE_URL", value: `\${${routeBaseUrlEnv(spec.defaultRoute)}}` });
    lines.push({ name: "OPENAI_API_KEY", value: "afs-gateway", comment: "placeholder" });
  }
  return lines;
}

/** The env preview as text, one `NAME=value  # comment` per line. */
export const renderEnv = (lines: readonly EnvLine[]): string =>
  lines.map((l) => `${l.name}=${l.value}${l.comment ? `  # ${l.comment}` : ""}`).join("\n");

/** The `models` route fields of `UpdateAgent` (API contract §4.13 changes to existing operations). */
export const toRoutesBody = (spec: AgentRoutesSpec) => ({
  routeAccess: spec.routeAccess,
  ...(spec.routeAccess === "selected" ? { routes: [...spec.routes] } : {}),
  defaultRoute: spec.defaultRoute === "" ? null : spec.defaultRoute,
});

// ---------------------------------------------------------------------------------------------------------------
// Endpoint forms (screens 57, 62)

export interface EndpointModelDraft {
  readonly modelName: string;
  readonly maxOutputTokens: number;
  /** Per-token only; prices are USD per million tokens, as decimal strings. */
  readonly inputUsdPerMtok?: string;
  readonly outputUsdPerMtok?: string;
}

export interface EndpointDraft {
  readonly slug: string;
  readonly displayName: string;
  readonly description: string;
  readonly provider: string;
  readonly location: EndpointLocation;
  readonly baseUrl: string;
  readonly protocols: readonly EndpointProtocol[];
  readonly authKind: AuthKind;
  readonly authHeader: string;
  readonly credentialMode: "shared" | "per_team";
  readonly pricingMode: PricingMode;
  readonly requiresTerms: boolean;
  readonly useProviderCost: boolean;
  readonly owner: string;
  readonly purpose: string;
  readonly models: readonly EndpointModelDraft[];
}

export const emptyEndpointDraft = (scope: "service" | "team"): EndpointDraft => ({
  slug: "",
  displayName: "",
  description: "",
  provider: scope === "team" ? "other" : "openai",
  location: scope === "team" ? "in_namespace" : "external",
  baseUrl: "",
  protocols: ["openai_chat"],
  authKind: scope === "team" ? "none" : "bearer",
  authHeader: "",
  credentialMode: "per_team",
  pricingMode: scope === "team" ? "capacity" : "per_token",
  requiresTerms: false,
  useProviderCost: false,
  owner: "",
  purpose: "",
  models: [],
});

export type EndpointErrors = Partial<Record<keyof EndpointDraft, string>>;

const MONEY = /^\d+(\.\d{1,6})?$/;

/** Client checks of screens 57 and 62 (the API repeats them and names `details.reason`). */
export function validateEndpoint(
  d: EndpointDraft,
  scope: "service" | "team",
  taken: readonly string[] = [],
): EndpointErrors {
  const e: EndpointErrors = {};
  if (d.slug === BEDROCK_ROUTE) e.slug = "bedrock is reserved for the built-in route";
  else if (!SLUG.test(d.slug))
    e.slug = "Use 2 to 31 lowercase letters, digits and hyphens, starting with a letter";
  else if (taken.includes(d.slug)) e.slug = "This route name is already used";
  if (!d.displayName.trim()) e.displayName = "Enter a display name";
  if (!d.baseUrl.trim()) e.baseUrl = "Enter the base URL";
  else if (d.location !== "in_namespace" && !d.baseUrl.startsWith("https://"))
    e.baseUrl = "External and corporate endpoints need an https:// URL";
  else if (d.location === "in_namespace" && !/^https?:\/\//.test(d.baseUrl))
    e.baseUrl = "Enter the Service URL, for example http://vllm-coder:8000/v1";
  if (!d.protocols.includes("openai_chat")) e.protocols = "Chat Completions is always served";
  if (d.authKind === "header" && !d.authHeader.trim()) e.authHeader = "Enter the header name";
  if (scope === "team") {
    if (!d.owner.trim()) e.owner = "Enter the owner";
    if (!d.purpose.trim()) e.purpose = "Enter the purpose";
  } else if (d.location === "in_namespace")
    e.location = "Only a team endpoint can run in the team's namespace";
  const names = d.models.map((m) => m.modelName.trim());
  if (names.some((n) => n === "")) e.models = "Every model needs a name";
  else if (new Set(names).size !== names.length) e.models = "Model names must be unique";
  else if (d.models.some((m) => !(m.maxOutputTokens > 0)))
    e.models = "Every model needs an output limit";
  else if (
    d.pricingMode === "per_token" &&
    d.models.some(
      (m) =>
        (m.inputUsdPerMtok && !MONEY.test(m.inputUsdPerMtok)) ||
        (m.outputUsdPerMtok && !MONEY.test(m.outputUsdPerMtok)),
    )
  )
    e.models = "Prices are USD per million tokens, for example 2.50";
  return e;
}

/** A per-token model without both prices saves but is *Not callable* (US-62). */
export const unpricedModels = (d: EndpointDraft): string[] =>
  d.pricingMode === "per_token"
    ? d.models.filter((m) => !m.inputUsdPerMtok || !m.outputUsdPerMtok).map((m) => m.modelName)
    : [];

const modelInputs = (d: EndpointDraft) =>
  d.models.map((m) => ({ modelName: m.modelName, maxOutputTokens: m.maxOutputTokens }));

/** The `CreateModelEndpoint` body (prices go in separate `CreateEndpointModelPrice` calls). */
export function toCreateServiceBody(d: EndpointDraft) {
  return {
    slug: d.slug,
    displayName: d.displayName,
    ...(d.description ? { description: d.description } : {}),
    provider: d.provider,
    location: d.location,
    baseUrl: d.baseUrl,
    protocols: [...d.protocols],
    authKind: d.authKind,
    ...(d.authKind === "header" ? { authHeader: d.authHeader } : {}),
    credentialMode: d.credentialMode,
    pricingMode: d.pricingMode,
    requiresTerms: d.requiresTerms,
    useProviderCost: d.useProviderCost,
    ...(d.models.length > 0 ? { models: modelInputs(d) } : {}),
  };
}

/** The `CreateTeamModelEndpoint` body; a team endpoint's per-token prices go inline on its models. */
export function toCreateTeamBody(d: EndpointDraft) {
  return {
    slug: d.slug,
    displayName: d.displayName,
    ...(d.description ? { description: d.description } : {}),
    owner: d.owner,
    purpose: d.purpose,
    location: d.location,
    baseUrl: d.baseUrl,
    protocols: [...d.protocols],
    authKind: d.authKind,
    ...(d.authKind === "header" ? { authHeader: d.authHeader } : {}),
    pricingMode: d.pricingMode,
    ...(d.models.length > 0
      ? {
          models: d.models.map((m) => ({
            modelName: m.modelName,
            maxOutputTokens: m.maxOutputTokens,
            ...(d.pricingMode === "per_token" && m.inputUsdPerMtok && m.outputUsdPerMtok
              ? {
                  price: {
                    inputUsdPerMtok: m.inputUsdPerMtok,
                    outputUsdPerMtok: m.outputUsdPerMtok,
                  },
                }
              : {}),
          })),
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Provider policy (screens 68, 68a)

export interface ProviderOffDraft {
  readonly provider: string;
  readonly reason: string;
  readonly fallbackModel: string;
  readonly selectForAllTeams: boolean;
}

/**
 * Why *Turn off* is not yet possible, or undefined when it is (TC-UI-11): a reason is needed, and Bedrock also needs a
 * fallback route model and *Select for every team* (the fallback must reach every team, PRD §7.4).
 */
export function providerOffBlock(d: ProviderOffDraft): string | undefined {
  if (d.provider === BEDROCK_ROUTE) {
    if (!d.fallbackModel) return "Choose a fallback default model";
    if (!d.selectForAllTeams) return "The fallback route must be selected for every team";
  }
  if (!d.reason.trim()) return "Enter a reason";
  return undefined;
}

/** Route models that can be Bedrock's fallback: on a switched-on endpoint whose provider is on, callable. */
export function fallbackCandidates(
  endpoints: readonly {
    readonly slug: string;
    readonly enabled: boolean;
    readonly provider: string;
    readonly providerState?: string | undefined;
    readonly models?:
      | readonly {
          readonly modelName: string;
          readonly enabled: boolean;
          readonly callable?: boolean | undefined;
        }[]
      | undefined;
  }[],
): string[] {
  return endpoints
    .filter((e) => e.enabled && e.provider !== BEDROCK_ROUTE && e.providerState !== "off")
    .flatMap((e) =>
      (e.models ?? [])
        .filter((m) => m.enabled && m.callable !== false)
        .map((m) => `${e.slug}/${m.modelName}`),
    )
    .sort();
}

/** Who picks teams for a provider, in the words of screen 68. */
export const teamSelectionWord = (p: { provider: string; teamSelection: string }): string =>
  p.provider === BEDROCK_ROUTE
    ? "Every team (model catalog)"
    : p.teamSelection === "service_admin"
      ? "Service admins"
      : "Team-admins";

/** The credential kind of a provider's routes (screen 68). */
export const providerCredentialWord = (provider: string): string =>
  provider === BEDROCK_ROUTE
    ? "Gateway AWS role"
    : provider === "azure" || provider === "google"
      ? "Workload identity federation"
      : provider === "other"
        ? "Team's own key"
        : "API key per team";

/** The dot of a count that needs attention (screen 68a): amber when it is not zero. */
export const attentionDot = (n: number): Dot => (n > 0 ? "amber" : "grey");

// ---------------------------------------------------------------------------------------------------------------
// CLI previews (WEB-6). Booleans render the AWS CLI pair `--x` / `--no-x` (TC-CLI-05).

/** Replaces `--flag true|false` with `--flag` / `--no-flag`. */
export function withBoolFlags(cmd: CliCommand): CliCommand {
  return {
    ...cmd,
    args: cmd.args.map(([f, v]) =>
      v === "true" ? boolFlag(f, true) : v === "false" ? boolFlag(f, false) : [f, v],
    ),
  };
}

const cli = (op: string, values: Readonly<Record<string, CliValue>>) =>
  withBoolFlags(buildCli(op, values));

export const createModelEndpointCli = (d: EndpointDraft): CliCommand => {
  const b = toCreateServiceBody(d);
  return cli("CreateModelEndpoint", b);
};

export const createTeamModelEndpointCli = (teamId: string, d: EndpointDraft): CliCommand =>
  cli("CreateTeamModelEndpoint", { teamId, ...toCreateTeamBody(d) });

export const updateModelEndpointEnabledCli = (endpointId: string, enabled: boolean): CliCommand =>
  cli("UpdateModelEndpoint", { endpointId, enabled });

export const putTeamModelEndpointsCli = (
  teamId: string,
  endpointIds: readonly string[],
): CliCommand => cli("PutTeamModelEndpoints", { teamId, endpointIds: [...endpointIds] });

export const putTeamGatewaySettingsCli = (
  teamId: string,
  v: {
    deployment: string;
    mayAddModelEndpoints: boolean;
    mayAddMcpServers?: boolean | undefined;
    mcpPlacement?: string | undefined;
  },
): CliCommand =>
  cli("PutTeamGatewaySettings", {
    teamId,
    deployment: v.deployment,
    mayAddModelEndpoints: v.mayAddModelEndpoints,
    ...(v.mayAddMcpServers !== undefined && { mayAddMcpServers: v.mayAddMcpServers }),
    ...(v.mcpPlacement !== undefined && { mcpPlacement: v.mcpPlacement }),
  });

/** A credential command: the value is a `file://<path>` placeholder, never read (TC-UI-06). */
export const putModelEndpointCredentialCli = (endpointId: string, scope: string): CliCommand =>
  cli("PutModelEndpointCredential", { endpointId, scope, value: "" });

export const putTeamModelEndpointCredentialCli = (teamId: string, endpointId: string): CliCommand =>
  cli("PutTeamModelEndpointCredential", { teamId, endpointId, value: "" });

export const putEndpointFederationCli = (
  endpointId: string,
  teamId: string,
  v: Readonly<Record<string, string>>,
): CliCommand =>
  cli("PutEndpointFederation", {
    endpointId,
    teamId,
    ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")),
  });

export const createEndpointModelPriceCli = (
  endpointId: string,
  v: {
    modelName: string;
    inputUsdPerMtok: string;
    outputUsdPerMtok: string;
    effectiveFrom: string;
  },
): CliCommand => cli("CreateEndpointModelPrice", { endpointId, ...v });

/** `update-inference-provider` (TC-CLI-05): `--no-enabled --fallback-model … --select-for-all-teams --reason …`. */
export function updateInferenceProviderCli(
  provider: string,
  v: {
    enabled: boolean;
    reason?: string;
    fallbackModel?: string;
    selectForAllTeams?: boolean;
  },
): CliCommand {
  const values: Record<string, CliValue> = { provider, enabled: v.enabled };
  if (v.fallbackModel) values.fallbackModel = v.fallbackModel;
  if (v.selectForAllTeams !== undefined && v.fallbackModel)
    values.selectForAllTeams = v.selectForAllTeams;
  if (v.reason) values.reason = v.reason;
  const cmd = cli("UpdateInferenceProvider", values);
  return { ...cmd, args: cmd.args.filter(([f]) => f !== "dry-run") };
}

/** The agent's route choice as `afs agents update-agent --models '<json>'` (contract 1.5.0 has no PutAgentModels). */
export const updateAgentRoutesCli = (
  teamId: string,
  agentId: string,
  models: Readonly<Record<string, unknown>>,
): CliCommand => cli("UpdateAgent", { teamId, agentId, models });

export { BARE_FLAG };
