import {
  type AfsClient,
  adminEndpointPriceProposals,
  adminModelEndpoints,
  adminTeams,
  createInferenceProviders,
  createReports,
  type InferenceQueryInput,
  type InferenceReport,
  money,
  teams,
  type UpdateInferenceProviderRequest,
} from "@afs/sdk";
import type {
  AdminModelEndpointsPort,
  CredentialRecord,
  EndpointProposalRecord,
  EndpointRecord,
  EndpointTeamRecord,
  FederationRecord,
  GatewaySettingsInput,
  GatewaySettingsRecord,
  InferenceProvidersPort,
  InferenceQuery,
  InferenceReportData,
  InferenceReportsPort,
  InferenceScope,
  PriceInput,
  ProviderChange,
  ProviderRecord,
  Ref,
  TeamEndpointRecord,
  TeamEndpointsRecord,
  TeamModelEndpointsPort,
} from "../../application/ports/modelEndpoints.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};
async function all<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

const cred = (c: { state: string; rotatedAt: string | null }): CredentialRecord => ({
  state: c.state,
  rotatedAt: c.rotatedAt,
});

/** `admin.modelEndpoints`, `admin.endpointPriceProposals` and `admin.teams` mapped to {@link AdminModelEndpointsPort}. */
export class SdkAdminModelEndpoints implements AdminModelEndpointsPort {
  constructor(private readonly client: AfsClient) {}
  #m() {
    return adminModelEndpoints(this.client);
  }
  list(includeTeams: boolean, signal?: AbortSignal): Promise<readonly EndpointRecord[]> {
    return wrap(() => all(this.#m().list({ includeTeams, maxResults: 100, ...sig(signal) })));
  }
  get(endpointId: string, signal?: AbortSignal): Promise<EndpointRecord> {
    return wrap(() => this.#m().get(endpointId, sig(signal)));
  }
  create(body: Readonly<Record<string, unknown>>): Promise<EndpointRecord> {
    return wrap(() => this.#m().create(body as never));
  }
  setEnabled(ref: Ref, enabled: boolean): Promise<EndpointRecord> {
    return wrap(() => this.#m().update({ id: ref.id, version: ref.version }, { enabled }));
  }
  delete(ref: Ref): Promise<void> {
    return wrap(async () => {
      await this.#m().delete({ id: ref.id, version: ref.version });
    });
  }
  createPrice(endpointId: string, p: PriceInput): Promise<void> {
    return wrap(async () => {
      await this.#m().createPrice(endpointId, {
        modelName: p.modelName,
        effectiveFrom: p.effectiveFrom,
        inputUsdPerMtok: money(p.inputUsdPerMtok),
        outputUsdPerMtok: money(p.outputUsdPerMtok),
      });
    });
  }
  teams(endpointId: string, signal?: AbortSignal): Promise<readonly EndpointTeamRecord[]> {
    return wrap(() => all(this.#m().teams(endpointId, { maxResults: 100, ...sig(signal) })));
  }
  putCredential(endpointId: string, scope: string, value: string): Promise<CredentialRecord> {
    return wrap(async () => cred(await this.#m().putCredential(endpointId, scope, { value })));
  }
  rotateCredential(endpointId: string, scope: string, value: string): Promise<CredentialRecord> {
    return wrap(async () => cred(await this.#m().rotateCredential(endpointId, scope, { value })));
  }
  putFederation(
    endpointId: string,
    teamId: string,
    fields: Readonly<Record<string, string>>,
  ): Promise<FederationRecord> {
    return wrap(() => this.#m().putFederation(endpointId, teamId, { ...fields }));
  }
  proposals(status: string, signal?: AbortSignal): Promise<readonly EndpointProposalRecord[]> {
    return wrap(() =>
      all(
        adminEndpointPriceProposals(this.client).list({
          status: status as never,
          maxResults: 100,
          ...sig(signal),
        }),
      ),
    );
  }
  approve(id: string, note?: string): Promise<EndpointProposalRecord> {
    return wrap(() => adminEndpointPriceProposals(this.client).approve(id, note ? { note } : {}));
  }
  reject(id: string, note?: string): Promise<EndpointProposalRecord> {
    return wrap(() => adminEndpointPriceProposals(this.client).reject(id, note ? { note } : {}));
  }
  putGatewaySettings(
    teamId: string,
    teamVersion: number | undefined,
    v: GatewaySettingsInput,
  ): Promise<GatewaySettingsRecord> {
    return wrap(() =>
      adminTeams(this.client).putGatewaySettings(
        teamVersion === undefined ? teamId : { id: teamId, version: teamVersion },
        Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined)) as never,
      ),
    );
  }
}

/** Drops `undefined` members (exact optional properties). */
const change = (c: ProviderChange): UpdateInferenceProviderRequest =>
  Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as never;

/** `createInferenceProviders` mapped to {@link InferenceProvidersPort}. */
export class SdkInferenceProviders implements InferenceProvidersPort {
  readonly #p;
  constructor(client: AfsClient) {
    this.#p = createInferenceProviders(client);
  }
  list(signal?: AbortSignal): Promise<readonly ProviderRecord[]> {
    return wrap(async () => (await this.#p.list(sig(signal))).items);
  }
  impact(ref: { provider: string; version: number }, c: ProviderChange): Promise<ProviderRecord> {
    return wrap(() =>
      this.#p.update({ id: ref.provider, version: ref.version }, change(c), { dryRun: true }),
    );
  }
  update(ref: { provider: string; version: number }, c: ProviderChange): Promise<ProviderRecord> {
    return wrap(() => this.#p.update({ id: ref.provider, version: ref.version }, change(c)));
  }
}

/** `teams.modelEndpoints` mapped to {@link TeamModelEndpointsPort}. */
export class SdkTeamModelEndpoints implements TeamModelEndpointsPort {
  constructor(private readonly client: AfsClient) {}
  #t() {
    return teams(this.client).modelEndpoints;
  }
  list(teamId: string, signal?: AbortSignal): Promise<TeamEndpointsRecord> {
    return wrap(async () => {
      const pages = this.#t().list(teamId, { maxResults: 100, ...sig(signal) });
      const first = await pages.first();
      const items: TeamEndpointRecord[] = [...first.items];
      let token = first.nextToken;
      while (token) {
        const next = await this.#t()
          .list(teamId, { maxResults: 100, nextToken: token, ...sig(signal) })
          .first();
        items.push(...next.items);
        token = next.nextToken;
      }
      const extra = (first.extras ?? {}) as {
        gatewayDeployment?: string;
        mayAddModelEndpoints?: boolean;
      };
      return {
        gatewayDeployment: extra.gatewayDeployment ?? "shared",
        mayAddModelEndpoints: extra.mayAddModelEndpoints === true,
        items,
      };
    });
  }
  putSelections(teamId: string, endpointIds: readonly string[]): Promise<readonly string[]> {
    return wrap(
      async () =>
        (await this.#t().putSelections(teamId, { endpointIds: [...endpointIds] })).endpointIds,
    );
  }
  create(teamId: string, body: Readonly<Record<string, unknown>>): Promise<TeamEndpointRecord> {
    return wrap(async () => {
      const e = await this.#t().create(teamId, body as never);
      return e as unknown as TeamEndpointRecord;
    });
  }
  delete(teamId: string, ref: Ref): Promise<void> {
    return wrap(async () => {
      await this.#t().delete(teamId, { id: ref.id, version: ref.version });
    });
  }
  putCredential(teamId: string, endpointId: string, value: string): Promise<CredentialRecord> {
    return wrap(async () => cred(await this.#t().putCredential(teamId, endpointId, { value })));
  }
}

const toData = (r: InferenceReport): InferenceReportData => ({
  range: r.range,
  groupBy: r.groupBy,
  rows: r.rows,
  totals: r.totals,
  notes: r.notes,
});

function query(q: InferenceQuery, signal?: AbortSignal): InferenceQueryInput {
  const o: InferenceQueryInput = {};
  if (q.range) o.range = q.range;
  if (q.groupBy && q.groupBy.length > 0) o.groupBy = [...q.groupBy];
  if (q.route) o.route = q.route;
  if (q.agentId) o.agentId = q.agentId;
  if (q.teamId) o.teamId = q.teamId;
  if (signal) o.signal = signal;
  return o;
}

/** `reports.inference` / `reports.teamInference` mapped to {@link InferenceReportsPort}. */
export class SdkInferenceReports implements InferenceReportsPort {
  readonly #r;
  constructor(client: AfsClient) {
    this.#r = createReports(client);
  }
  #call(scope: InferenceScope, q: InferenceQuery, signal?: AbortSignal) {
    const o = query(q, signal);
    if (scope.level === "team") {
      const { teamId: _t, ...rest } = o;
      return this.#r.teamInference(scope.teamId, rest);
    }
    return this.#r.inference(o);
  }
  run(scope: InferenceScope, q: InferenceQuery, signal?: AbortSignal) {
    return wrap(async () => toData(await this.#call(scope, q, signal)));
  }
  csv(scope: InferenceScope, q: InferenceQuery, signal?: AbortSignal) {
    return wrap(() => this.#call(scope, q, signal).asCsv());
  }
}
