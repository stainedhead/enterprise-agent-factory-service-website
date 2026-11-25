import {
  type AfsClient,
  agents,
  createReports,
  type McpUsageQueryInput,
  type McpUsageReport,
  mcpReviews,
  mcpServers,
  mcpSettings,
  type Paginated,
  teams,
} from "@afs/sdk";
import type {
  CredentialInput,
  EffectiveMcpRecord,
  FederatedIdentitiesPort,
  FederatedIdentityRecord,
  McpCatalogPort,
  McpChangeRecord,
  McpCredentialRecord,
  McpPolicyRecord,
  McpPolicyRuleRecord,
  McpPrimitiveRecord,
  McpReviewRecord,
  McpScopeRef,
  McpServerFilter,
  McpServerRecord,
  McpUsageData,
  McpUsagePort,
  McpUsageQuery,
  QueryCaptureRecord,
  Ref,
  ReviewInput,
  TeamMcpPort,
  TeamMcpServerRecord,
} from "../../application/ports/mcp.js";
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

/** Only the credential's metadata is kept; the API never returns a value and nothing else is copied. */
const cred = (c: McpCredentialRecord): McpCredentialRecord => ({
  scope: c.scope,
  state: c.state,
  scopes: [...c.scopes],
  ...(c.kind === undefined ? {} : { kind: c.kind }),
  ...(c.subject === undefined ? {} : { subject: c.subject }),
  ...(c.rotatedAt === undefined ? {} : { rotatedAt: c.rotatedAt }),
  ...(c.expiresAt === undefined ? {} : { expiresAt: c.expiresAt }),
});

/** The request body for a credential: a static value, or an OAuth client id and secret. */
const credBody = (c: CredentialInput) =>
  "value" in c ? { value: c.value } : { clientId: c.clientId, clientSecret: c.clientSecret };

const note = (n?: string) => (n ? { note: n } : {});
const review = (i: ReviewInput) => ({
  note: i.note,
  ...(i.primitives ? { primitives: i.primitives.map((p) => ({ ...p })) } : {}),
});
/** Drops `undefined` members (exact optional properties). */
const rules = (r: readonly McpPolicyRuleRecord[]) => ({
  rules: r.map(
    (x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) as never,
  ),
});
const pages = <T>(p: Paginated<T>) => all(p as AsyncIterable<T>);

/** `mcpServers`, `mcpReviews` and `mcpSettings` mapped to {@link McpCatalogPort} (contract §4.14). */
export class SdkMcpCatalog implements McpCatalogPort {
  constructor(private readonly client: AfsClient) {}
  #s() {
    return mcpServers(this.client);
  }
  list(filter: McpServerFilter, signal?: AbortSignal): Promise<readonly McpServerRecord[]> {
    return wrap(() =>
      pages(
        this.#s().list({
          ...(filter.scope ? { scope: filter.scope } : {}),
          ...(filter.reviewStatus ? { reviewStatus: filter.reviewStatus } : {}),
          maxResults: 100,
          ...sig(signal),
        }),
      ),
    );
  }
  get(id: string, signal?: AbortSignal): Promise<McpServerRecord> {
    return wrap(() => this.#s().get(id, sig(signal)));
  }
  create(body: Readonly<Record<string, unknown>>): Promise<McpServerRecord> {
    return wrap(() => this.#s().create(body as never));
  }
  importManifest(
    manifest: Readonly<Record<string, unknown>>,
    slug?: string,
  ): Promise<McpServerRecord> {
    return wrap(() =>
      this.#s().importManifest({ manifest: { ...manifest }, ...(slug ? { slug } : {}) }),
    );
  }
  update(ref: Ref, body: Readonly<Record<string, unknown>>): Promise<McpServerRecord> {
    return wrap(() => this.#s().update({ id: ref.id, version: ref.version }, body as never));
  }
  delete(ref: Ref): Promise<void> {
    return wrap(async () => {
      await this.#s().delete({ id: ref.id, version: ref.version });
    });
  }
  publish(id: string, n?: string): Promise<McpServerRecord> {
    return wrap(() => this.#s().publish(id, note(n)));
  }
  retire(id: string, n?: string): Promise<McpServerRecord> {
    return wrap(() => this.#s().retire(id, note(n)));
  }
  suspend(id: string, reason: string): Promise<McpServerRecord> {
    return wrap(() => this.#s().suspend(id, { reason }));
  }
  resume(id: string, reason: string): Promise<McpServerRecord> {
    return wrap(() => this.#s().resume(id, { reason }));
  }
  refresh(id: string): Promise<McpServerRecord> {
    return wrap(() => this.#s().refresh(id));
  }
  primitives(id: string, signal?: AbortSignal): Promise<readonly McpPrimitiveRecord[]> {
    return wrap(() => pages(this.#s().primitives(id, { maxResults: 100, ...sig(signal) })));
  }
  change(id: string, primitiveId: string, signal?: AbortSignal): Promise<McpChangeRecord> {
    return wrap(() => this.#s().primitiveChange(id, primitiveId, sig(signal)));
  }
  decidePrimitive(
    id: string,
    primitiveId: string,
    decision: "approve" | "reject",
    n?: string,
  ): Promise<McpPrimitiveRecord> {
    return wrap(() =>
      decision === "approve"
        ? this.#s().approvePrimitive(id, primitiveId, note(n))
        : this.#s().rejectPrimitive(id, primitiveId, note(n)),
    );
  }
  review(
    id: string,
    decision: "approve" | "reject" | "request-changes",
    input: ReviewInput,
  ): Promise<McpServerRecord> {
    const body = review(input);
    return wrap(() =>
      decision === "approve"
        ? this.#s().approve(id, body)
        : decision === "reject"
          ? this.#s().reject(id, body)
          : this.#s().requestChanges(id, body),
    );
  }
  putPolicy(id: string, r: readonly McpPolicyRuleRecord[]): Promise<McpPolicyRecord> {
    return wrap(() => this.#s().putPolicy(id, rules(r)));
  }
  putCredential(id: string, scope: string, c: CredentialInput): Promise<McpCredentialRecord> {
    return wrap(async () => cred(await this.#s().putCredential(id, scope, credBody(c))));
  }
  reviews(signal?: AbortSignal): Promise<readonly McpReviewRecord[]> {
    return wrap(() => pages(mcpReviews(this.client).list({ maxResults: 100, ...sig(signal) })));
  }
  queryCapture(signal?: AbortSignal): Promise<QueryCaptureRecord | null> {
    return wrap(async () => (await mcpSettings(this.client).getQueryCapture(sig(signal))).capture);
  }
  startCapture(days: number, reason: string): Promise<QueryCaptureRecord> {
    return wrap(() => mcpSettings(this.client).startQueryCapture({ days, reason }));
  }
  stopCapture(): Promise<QueryCaptureRecord> {
    return wrap(() => mcpSettings(this.client).stopQueryCapture());
  }
}

/** `teams.mcpServers` and `agents.mcp` mapped to {@link TeamMcpPort}. */
export class SdkTeamMcp implements TeamMcpPort {
  constructor(private readonly client: AfsClient) {}
  #t() {
    return teams(this.client).mcpServers;
  }
  list(teamId: string, signal?: AbortSignal): Promise<readonly TeamMcpServerRecord[]> {
    return wrap(() => pages(this.#t().list(teamId, { maxResults: 100, ...sig(signal) })));
  }
  get(teamId: string, id: string, signal?: AbortSignal): Promise<TeamMcpServerRecord> {
    return wrap(() => this.#t().get(teamId, id, sig(signal)));
  }
  put(teamId: string, id: string, enabled: boolean, mode?: string): Promise<TeamMcpServerRecord> {
    return wrap(() => this.#t().put(teamId, id, { enabled, ...(mode ? { mode } : {}) }));
  }
  create(teamId: string, body: Readonly<Record<string, unknown>>): Promise<McpServerRecord> {
    return wrap(() => this.#t().create(teamId, body as never));
  }
  delete(teamId: string, ref: Ref): Promise<void> {
    return wrap(async () => {
      await this.#t().delete(teamId, { id: ref.id, version: ref.version });
    });
  }
  submit(teamId: string, id: string): Promise<McpServerRecord> {
    return wrap(() => this.#t().submit(teamId, id));
  }
  review(
    teamId: string,
    id: string,
    decision: "approve" | "reject",
    input: ReviewInput,
  ): Promise<McpServerRecord> {
    const body = review(input);
    return wrap(() =>
      decision === "approve"
        ? this.#t().approve(teamId, id, body)
        : this.#t().reject(teamId, id, body),
    );
  }
  refresh(teamId: string, id: string): Promise<McpServerRecord> {
    return wrap(() => this.#t().refresh(teamId, id));
  }
  primitives(
    teamId: string,
    id: string,
    signal?: AbortSignal,
  ): Promise<readonly McpPrimitiveRecord[]> {
    return wrap(() => pages(this.#t().primitives(teamId, id, { maxResults: 100, ...sig(signal) })));
  }
  decidePrimitive(
    teamId: string,
    id: string,
    primitiveId: string,
    decision: "approve" | "reject",
    n?: string,
  ): Promise<McpPrimitiveRecord> {
    return wrap(() =>
      decision === "approve"
        ? this.#t().approvePrimitive(teamId, id, primitiveId, note(n))
        : this.#t().rejectPrimitive(teamId, id, primitiveId, note(n)),
    );
  }
  putPolicy(
    teamId: string,
    id: string,
    r: readonly McpPolicyRuleRecord[],
  ): Promise<McpPolicyRecord> {
    return wrap(() => this.#t().putPolicy(teamId, id, rules(r)));
  }
  putCredential(teamId: string, id: string, c: CredentialInput): Promise<McpCredentialRecord> {
    return wrap(async () => cred(await this.#t().putCredential(teamId, id, credBody(c))));
  }
  startOAuth(
    teamId: string,
    id: string,
  ): Promise<{ readonly authorizationUrl: string; readonly expiresAt: string }> {
    // The single-use state stays with the API and the browser redirect; the console keeps only the URL to open.
    return wrap(async () => {
      const s = await this.#t().startOAuth(teamId, id);
      return { authorizationUrl: s.authorizationUrl, expiresAt: s.expiresAt };
    });
  }
  disconnectOAuth(teamId: string, id: string): Promise<McpCredentialRecord> {
    return wrap(async () => cred(await this.#t().disconnectOAuth(teamId, id)));
  }
  testFederation(teamId: string, id: string): Promise<TeamMcpServerRecord> {
    return wrap(() => this.#t().testFederation(teamId, id));
  }
  effective(teamId: string, agentId: string, signal?: AbortSignal): Promise<EffectiveMcpRecord> {
    return wrap(() => agents(this.client).mcp(teamId, agentId, sig(signal)));
  }
}

const toUsage = (r: McpUsageReport): McpUsageData => ({
  from: r.from,
  to: r.to,
  view: r.view,
  groupBy: r.groupBy,
  ...(r.windowDays === undefined ? {} : { windowDays: r.windowDays }),
  rows: r.rows,
});

/** `reports.mcpUsage` / `reports.teamMcpUsage` mapped to {@link McpUsagePort}. */
export class SdkMcpUsage implements McpUsagePort {
  readonly #r;
  constructor(client: AfsClient) {
    this.#r = createReports(client);
  }
  #call(scope: McpScopeRef, q: McpUsageQuery, signal?: AbortSignal) {
    const o: McpUsageQueryInput = {
      view: q.view as never,
      groupBy: q.groupBy as never,
      ...(q.windowDays === undefined ? {} : { window: q.windowDays }),
      ...sig(signal),
    };
    return scope.level === "team" ? this.#r.teamMcpUsage(scope.teamId, o) : this.#r.mcpUsage(o);
  }
  run(scope: McpScopeRef, q: McpUsageQuery, signal?: AbortSignal): Promise<McpUsageData> {
    return wrap(async () => toUsage(await this.#call(scope, q, signal)));
  }
  csv(scope: McpScopeRef, q: McpUsageQuery, signal?: AbortSignal): Promise<string> {
    return wrap(() => this.#call(scope, q, signal).asCsv());
  }
}

/** `agents.federatedIdentities` mapped to {@link FederatedIdentitiesPort}. */
export class SdkFederatedIdentities implements FederatedIdentitiesPort {
  constructor(private readonly client: AfsClient) {}
  #f() {
    return agents(this.client).federatedIdentities;
  }
  list(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly FederatedIdentityRecord[]> {
    return wrap(() => pages(this.#f().list(teamId, agentId, sig(signal))));
  }
  put(
    teamId: string,
    agentId: string,
    name: string,
    body: { readonly audience: string; readonly expirationSeconds?: number | undefined },
  ): Promise<FederatedIdentityRecord> {
    return wrap(() =>
      this.#f().put(teamId, agentId, name, {
        audience: body.audience,
        ...(body.expirationSeconds === undefined
          ? {}
          : { expirationSeconds: body.expirationSeconds }),
      }),
    );
  }
  delete(
    teamId: string,
    agentId: string,
    ref: { readonly name: string; readonly version: number },
  ): Promise<void> {
    return wrap(async () => {
      await this.#f().delete(teamId, agentId, { id: ref.name, version: ref.version });
    });
  }
}
