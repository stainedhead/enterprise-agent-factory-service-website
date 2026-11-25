import {
  type AgentRoutesSpec,
  BEDROCK_ROUTE,
  type EndpointDraft,
  fallbackCandidates,
  type ProviderOffDraft,
  providerOffBlock,
  type RouteChoice,
  toCreateServiceBody,
  toCreateTeamBody,
  toRoutesBody,
  validateEndpoint,
  validateRoutes,
} from "../../../domain/modelEndpoints.js";
import { AppError } from "../../errors.js";
import type { AgentRecord, AgentsPort } from "../../ports/agents.js";
import type { ClockPort } from "../../ports/auth.js";
import type {
  AdminModelEndpointsPort,
  CredentialRecord,
  EndpointProposalRecord,
  EndpointRecord,
  InferenceProvidersPort,
  InferenceQuery,
  InferenceReportData,
  InferenceReportsPort,
  InferenceScope,
  PriceInput,
  ProviderRecord,
  Ref,
  TeamEndpointRecord,
  TeamEndpointsRecord,
  TeamModelEndpointsPort,
} from "../../ports/modelEndpoints.js";

const invalid = (fields: Readonly<Record<string, string>>, message = "Check the form") =>
  new AppError({ kind: "validation", message, fields });

const noValue = () => invalid({ value: "Enter the credential" }, "Enter the credential");

const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);

/** The service catalog split as screen 56 shows it: built-in first, then by route name; team-declared apart. */
export interface Catalog {
  readonly service: readonly EndpointRecord[];
  readonly team: readonly EndpointRecord[];
}

/** A pending endpoint price proposal beside the price it would replace (screen 56). */
export interface EndpointProposalRow {
  readonly proposal: EndpointProposalRecord;
  readonly slug: string;
  readonly old: { readonly inputUsdPerMtok: string; readonly outputUsdPerMtok: string } | undefined;
}

/** Service model endpoints: catalog, create, switch, credentials, federation, prices (US-62..66). */
export class AdminModelEndpointsUseCases {
  constructor(
    private readonly port: AdminModelEndpointsPort,
    private readonly clock: Pick<ClockPort, "now">,
  ) {}

  async catalog(signal?: AbortSignal): Promise<Catalog> {
    const all = await this.port.list(true, signal);
    const service = all
      .filter((e) => e.teamId === null)
      .sort((a, b) => Number(b.builtin === true) - Number(a.builtin === true) || bySlug(a, b));
    return { service, team: all.filter((e) => e.teamId !== null).sort(bySlug) };
  }

  detail(endpointId: string, signal?: AbortSignal) {
    return this.port.get(endpointId, signal);
  }

  teams(endpointId: string, signal?: AbortSignal) {
    return this.port.teams(endpointId, signal);
  }

  /**
   * *Create* of the wizard (screen 57): the endpoint is created off, then each per-token model's price is added
   * effective now (`CreateEndpointModelPrice`, `admin:pricing`). A model without both prices stays *Not callable*.
   */
  async create(d: EndpointDraft, taken: readonly string[] = []): Promise<EndpointRecord> {
    const errors = validateEndpoint(d, "service", taken);
    if (Object.keys(errors).length > 0) throw invalid(errors as Record<string, string>);
    const created = await this.port.create(toCreateServiceBody(d));
    if (d.pricingMode === "per_token") {
      const effectiveFrom = new Date(this.clock.now()).toISOString();
      for (const m of d.models)
        if (m.inputUsdPerMtok && m.outputUsdPerMtok)
          await this.port.createPrice(created.id, {
            modelName: m.modelName,
            inputUsdPerMtok: m.inputUsdPerMtok,
            outputUsdPerMtok: m.outputUsdPerMtok,
            effectiveFrom,
          });
    }
    return created;
  }

  /** *Add price* on a per-token model (`CreateEndpointModelPrice`, `admin:pricing`); USD per million tokens. */
  addPrice(endpointId: string, p: PriceInput): Promise<void> {
    const bad = (v: string) => !/^\d+(\.\d{1,6})?$/.test(v);
    const fields: Record<string, string> = {};
    if (bad(p.inputUsdPerMtok)) fields.inputUsdPerMtok = "Enter a price, for example 2.50";
    if (bad(p.outputUsdPerMtok)) fields.outputUsdPerMtok = "Enter a price, for example 10.00";
    if (Number.isNaN(Date.parse(p.effectiveFrom))) fields.effectiveFrom = "Enter a date";
    if (Object.keys(fields).length > 0) return Promise.reject(invalid(fields));
    return this.port.createPrice(endpointId, p);
  }

  /** The service switch; the built-in Bedrock route is switched by provider policy, never here. */
  setEnabled(e: Pick<EndpointRecord, "id" | "version" | "slug">, enabled: boolean) {
    if (e.slug === BEDROCK_ROUTE)
      return Promise.reject(invalid({}, "Bedrock is switched on the Provider policy tab"));
    return this.port.setEnabled({ id: e.id, version: e.version }, enabled);
  }

  /** Delete is refused by the API while the endpoint is on (`409 endpoint_enabled`); checked here first. */
  delete(e: Pick<EndpointRecord, "id" | "version" | "enabled">): Promise<void> {
    if (e.enabled) return Promise.reject(invalid({}, "Turn the endpoint off before deleting it"));
    return this.port.delete({ id: e.id, version: e.version });
  }

  /** Write-only: the value goes to the port once and is never kept (TC-UI-06). */
  setCredential(endpointId: string, scope: string, value: string): Promise<CredentialRecord> {
    if (value === "") return Promise.reject(noValue());
    return this.port.putCredential(endpointId, scope, value);
  }

  rotateCredential(endpointId: string, scope: string, value: string): Promise<CredentialRecord> {
    if (value === "") return Promise.reject(noValue());
    return this.port.rotateCredential(endpointId, scope, value);
  }

  /** Federation metadata only (PRD §11.1); empty fields are left out. */
  putFederation(endpointId: string, teamId: string, fields: Readonly<Record<string, string>>) {
    const clean = Object.fromEntries(
      Object.entries(fields)
        .map(([k, v]) => [k, v.trim()] as const)
        .filter(([, v]) => v !== ""),
    );
    if (Object.keys(clean).length === 0)
      return Promise.reject(invalid({}, "Enter the identifiers the cloud admins set up"));
    return this.port.putFederation(endpointId, teamId, clean);
  }

  async pendingProposals(signal?: AbortSignal): Promise<readonly EndpointProposalRow[]> {
    const [list, endpoints] = await Promise.all([
      this.port.proposals("pending", signal),
      this.port.list(false, signal),
    ]);
    const byId = new Map(endpoints.map((e) => [e.id, e]));
    return list.map((proposal) => {
      const e = byId.get(proposal.endpointId);
      const price = e?.models?.find((m) => m.modelName === proposal.modelName)?.price ?? undefined;
      return {
        proposal,
        slug: proposal.slug ?? e?.slug ?? proposal.endpointId,
        old: price
          ? { inputUsdPerMtok: price.inputUsdPerMtok, outputUsdPerMtok: price.outputUsdPerMtok }
          : undefined,
      };
    });
  }

  decide(id: string, decision: "approve" | "reject", note?: string) {
    const n = note?.trim() || undefined;
    return decision === "approve" ? this.port.approve(id, n) : this.port.reject(id, n);
  }

  /** Screen 60: the team's gateway deployment and whether it may declare its own endpoints. */
  putGatewaySettings(
    teamId: string,
    teamVersion: number | undefined,
    v: { deployment: string; mayAddModelEndpoints: boolean },
  ) {
    return this.port.putGatewaySettings(teamId, teamVersion, v);
  }
}

/** Provider switches (screens 68, 68a; US-78, US-80, US-81). */
export class ProviderPolicyUseCases {
  constructor(
    private readonly providers: InferenceProvidersPort,
    private readonly endpoints: AdminModelEndpointsPort,
  ) {}

  list(signal?: AbortSignal): Promise<readonly ProviderRecord[]> {
    return this.providers.list(signal);
  }

  /** Route models that can replace Bedrock as the service default. */
  async fallbackOptions(signal?: AbortSignal): Promise<string[]> {
    return fallbackCandidates(await this.endpoints.list(false, signal));
  }

  #change(d: ProviderOffDraft) {
    return {
      enabled: false,
      reason: d.reason.trim(),
      ...(d.provider === BEDROCK_ROUTE && {
        fallbackModel: d.fallbackModel,
        selectForAllTeams: d.selectForAllTeams,
      }),
    };
  }

  /** The dry run of screen 68a: the impact counts, nothing written. */
  impact(p: Pick<ProviderRecord, "provider" | "version">, d: ProviderOffDraft) {
    return this.providers.impact(
      { provider: p.provider, version: p.version },
      {
        ...this.#change(d),
        reason: d.reason.trim() || "impact preview",
      },
    );
  }

  /** *Turn off*, only once the confirmation is complete (TC-UI-11). */
  turnOff(p: Pick<ProviderRecord, "provider" | "version">, d: ProviderOffDraft) {
    const block = providerOffBlock(d);
    if (block) return Promise.reject(invalid({}, block));
    return this.providers.update({ provider: p.provider, version: p.version }, this.#change(d));
  }

  turnOn(p: Pick<ProviderRecord, "provider" | "version">, reason: string) {
    return this.providers.update(
      { provider: p.provider, version: p.version },
      { enabled: true, ...(reason.trim() ? { reason: reason.trim() } : {}) },
    );
  }
}

/** The team's routes grouped as screen 61 shows them. */
export interface TeamRoutes extends Omit<TeamEndpointsRecord, "items"> {
  readonly selected: readonly TeamEndpointRecord[];
  readonly own: readonly TeamEndpointRecord[];
  readonly available: readonly TeamEndpointRecord[];
}

/** A team's routes: opt in, remove, declare its own endpoints, set a credential (US-63, US-66, US-67). */
export class TeamModelEndpointsUseCases {
  constructor(private readonly port: TeamModelEndpointsPort) {}

  async routes(teamId: string, signal?: AbortSignal): Promise<TeamRoutes> {
    const r = await this.port.list(teamId, signal);
    const of = (rel: string) => r.items.filter((i) => i.relation === rel).sort(bySlug);
    return {
      gatewayDeployment: r.gatewayDeployment,
      mayAddModelEndpoints: r.mayAddModelEndpoints,
      selected: of("selected"),
      own: of("own"),
      available: of("available"),
    };
  }

  /** The opt-in list is replaced as a whole (`PutTeamModelEndpoints`): the current selection plus or minus one. */
  add(teamId: string, current: readonly TeamEndpointRecord[], endpointId: string) {
    const ids = [...new Set([...current.map((c) => c.id), endpointId])];
    return this.port.putSelections(teamId, ids);
  }

  remove(teamId: string, current: readonly TeamEndpointRecord[], endpointId: string) {
    return this.port.putSelections(
      teamId,
      current.map((c) => c.id).filter((id) => id !== endpointId),
    );
  }

  /** *Create endpoint* (screen 62); nothing is sent when the form is invalid. */
  create(teamId: string, d: EndpointDraft, taken: readonly string[] = []) {
    const errors = validateEndpoint(d, "team", taken);
    if (Object.keys(errors).length > 0)
      return Promise.reject(invalid(errors as Record<string, string>));
    return this.port.create(teamId, toCreateTeamBody(d));
  }

  delete(teamId: string, e: Ref) {
    return this.port.delete(teamId, e);
  }

  setCredential(teamId: string, endpointId: string, value: string) {
    if (value === "") return Promise.reject(noValue());
    return this.port.putCredential(teamId, endpointId, value);
  }
}

/** The inference report (screens 59, 64; US-73). */
export class InferenceReportUseCases {
  constructor(private readonly port: InferenceReportsPort) {}

  run(
    scope: InferenceScope,
    q: InferenceQuery,
    signal?: AbortSignal,
  ): Promise<InferenceReportData> {
    return this.port.run(scope, q, signal);
  }

  csv(scope: InferenceScope, q: InferenceQuery, signal?: AbortSignal): Promise<string> {
    return this.port.csv(scope, q, signal);
  }

  /** Spend per route from a report grouped by route (screen 61's *Spend MTD*, screen 65's sources). */
  static spendByRoute(r: InferenceReportData): ReadonlyMap<string, string> {
    return new Map(r.rows.filter((x) => x.route).map((x) => [x.route as string, x.costUsd]));
  }
}

/** An agent's routes (screen 63; US-68): saved through `UpdateAgent` `models` with `If-Match`. */
export class AgentRoutesUseCases {
  constructor(private readonly agents: Pick<AgentsPort, "update">) {}

  /**
   * Keeps the agent's Bedrock model choice as it is and replaces only the route fields. A stale version is the
   * API's `412 PreconditionFailed`; nothing changes then.
   */
  save(teamId: string, agent: AgentRecord, spec: AgentRoutesSpec, team: readonly RouteChoice[]) {
    const errors = validateRoutes(spec, team);
    if (Object.keys(errors).length > 0)
      return Promise.reject(invalid(errors as Record<string, string>));
    const m = agent.models;
    // a route default model is sent as <route>/<model>; the Bedrock default stays when there is none
    const defaultModelId =
      spec.defaultRoute && spec.defaultModel
        ? `${spec.defaultRoute}/${spec.defaultModel}`
        : m.defaultRoute
          ? (m.effectiveModelIds?.[0] ?? m.defaultModelId)
          : m.defaultModelId;
    return this.agents.update(
      teamId,
      { id: agent.id, version: agent.version },
      {
        models: {
          access: m.access,
          ...(m.access === "selected" ? { modelIds: [...m.modelIds] } : {}),
          defaultModelId,
          ...toRoutesBody(spec),
        },
      },
    );
  }
}

/** The route spec an agent holds now (the form's starting point). */
export function routesSpecOf(agent: AgentRecord): AgentRoutesSpec {
  const m = agent.models;
  const route = m.defaultRoute ?? "";
  const model =
    route && m.defaultModelId.startsWith(`${route}/`)
      ? m.defaultModelId.slice(route.length + 1)
      : route
        ? m.defaultModelId
        : "";
  return {
    routeAccess: m.routeAccess ?? "all",
    routes: m.routes ?? [],
    defaultRoute: route,
    defaultModel: model,
  };
}
