import {
  type AgentMcpSpec,
  type FederatedIdentityDraft,
  type McpServerChoice,
  type McpServerDraft,
  type PolicyRuleDraft,
  parseManifest,
  ruleError,
  TEAM_GATEWAY_REQUIRED,
  TEAM_SERVERS_NOT_ALLOWED,
  teamApproveBlock,
  toAgentMcpBody,
  toCreateMcpServerBody,
  toCreateTeamMcpServerBody,
  toRules,
  validateAgentMcp,
  validateFederatedIdentity,
  validateMcpServer,
} from "../../../domain/mcp.js";
import { AppError } from "../../errors.js";
import type { AgentRecord, AgentsPort } from "../../ports/agents.js";
import type {
  CredentialInput,
  FederatedIdentitiesPort,
  FederatedIdentityRecord,
  McpCatalogPort,
  McpChangeRecord,
  McpCredentialRecord,
  McpReviewRecord,
  McpScopeRef,
  McpServerRecord,
  McpUsageData,
  McpUsagePort,
  McpUsageQuery,
  McpUsageRowRecord,
  Ref,
  ReviewInput,
  TeamMcpPort,
  TeamMcpServerRecord,
} from "../../ports/mcp.js";

const invalid = (fields: Readonly<Record<string, string>>, message = "Check the form") =>
  new AppError({ kind: "validation", message, fields });

const bySlug = (a: { slug: string }, b: { slug: string }) => a.slug.localeCompare(b.slug);

/** A credential is sent only when every part of it was entered (the value never stays here). */
function checkCredential(c: CredentialInput): AppError | undefined {
  if ("value" in c) return c.value === "" ? invalid({ value: "Enter the credential" }) : undefined;
  const f: Record<string, string> = {};
  if (!c.clientId.trim()) f.clientId = "Enter the client id";
  if (c.clientSecret === "") f.clientSecret = "Enter the client secret";
  return Object.keys(f).length > 0 ? invalid(f, "Enter the client credentials") : undefined;
}

function checkReview(i: ReviewInput): AppError | undefined {
  return i.note.trim() === ""
    ? invalid({ note: "Enter a decision note" }, "A note is required")
    : undefined;
}

function checkRules(rules: readonly PolicyRuleDraft[]): AppError | undefined {
  const fields: Record<string, string> = {};
  rules.forEach((r, i) => {
    const e = ruleError(r);
    if (e) fields[`rules.${i}`] = e;
  });
  return Object.keys(fields).length > 0 ? invalid(fields, "Fix the rules first") : undefined;
}

/** The catalog as screen 46 shows it: enterprise servers first, team-managed apart, with counts. */
export interface McpCatalog {
  readonly enterprise: readonly McpServerRecord[];
  readonly team: readonly McpServerRecord[];
  readonly counts: {
    readonly published: number;
    readonly drafts: number;
    readonly teamApproved: number;
    readonly teamPending: number;
    readonly teamRejected: number;
  };
}

/** Service MCP servers: catalog, create and import, lifecycle, inventory, policy, credentials (MCP-US-1, -2). */
export class McpCatalogUseCases {
  constructor(private readonly port: McpCatalogPort) {}

  async catalog(signal?: AbortSignal): Promise<McpCatalog> {
    const all = await this.port.list({ scope: "all" }, signal);
    const enterprise = all.filter((s) => s.scope === "enterprise").sort(bySlug);
    const team = all.filter((s) => s.scope === "team").sort(bySlug);
    const n = (xs: readonly McpServerRecord[], f: (s: McpServerRecord) => boolean) =>
      xs.filter(f).length;
    return {
      enterprise,
      team,
      counts: {
        published: n(enterprise, (s) => s.published),
        drafts: n(enterprise, (s) => s.reviewStatus === "draft"),
        teamApproved: n(team, (s) => s.reviewStatus === "approved"),
        teamPending: n(team, (s) => s.reviewStatus === "pending_review"),
        teamRejected: n(team, (s) => s.reviewStatus === "rejected"),
      },
    };
  }

  detail(id: string, signal?: AbortSignal) {
    return this.port.get(id, signal);
  }

  primitives(id: string, signal?: AbortSignal) {
    return this.port.primitives(id, signal);
  }

  change(id: string, primitiveId: string, signal?: AbortSignal): Promise<McpChangeRecord> {
    return this.port.change(id, primitiveId, signal);
  }

  /** *Create* of screen 48: an enterprise server is created as a draft; nothing is sent for an invalid form. */
  create(d: McpServerDraft, taken: readonly string[] = []): Promise<McpServerRecord> {
    const errors = validateMcpServer(d, "enterprise", taken);
    if (Object.keys(errors).length > 0)
      return Promise.reject(invalid(errors as Record<string, string>));
    return this.port.create(toCreateMcpServerBody(d));
  }

  /** *Import server.json* (MCP-US-1 AC-1.2): a draft is pre-filled; nothing is published. */
  importManifest(text: string, slug?: string): Promise<McpServerRecord> {
    const m = parseManifest(text);
    if ("error" in m) return Promise.reject(invalid({ manifest: m.error }, m.error));
    const s = slug?.trim();
    return this.port.importManifest(m.manifest, s ? s : undefined);
  }

  /** *Make default for new teams* and other settings that are not part of review. */
  update(s: Pick<McpServerRecord, "id" | "version">, body: Readonly<Record<string, unknown>>) {
    return this.port.update({ id: s.id, version: s.version }, body);
  }

  /** Delete is for drafts and retired servers; the API refuses a server in use (`server_in_use`). */
  delete(s: Pick<McpServerRecord, "id" | "version" | "published">): Promise<void> {
    if (s.published) return Promise.reject(invalid({}, "Retire the server before deleting it"));
    return this.port.delete({ id: s.id, version: s.version });
  }

  /** *Publish* (AC-1.3): teams then see it as *off* in their catalog. */
  publish(s: Pick<McpServerRecord, "id" | "reviewStatus" | "scope">, note?: string) {
    if (s.scope !== "enterprise")
      return Promise.reject(invalid({}, "Only enterprise servers are published"));
    if (s.reviewStatus === "rejected" || s.reviewStatus === "suspended")
      return Promise.reject(invalid({}, "This server cannot be published in its current state"));
    return this.port.publish(s.id, note?.trim() || undefined);
  }

  retire(id: string, note?: string) {
    return this.port.retire(id, note?.trim() || undefined);
  }

  /** Suspend or resume any server (MCP-US-5 AC-5.3); a reason is required. */
  suspend(id: string, suspend: boolean, reason: string) {
    const r = reason.trim();
    if (!r) return Promise.reject(invalid({ reason: "Enter the reason" }, "A reason is required"));
    return suspend ? this.port.suspend(id, r) : this.port.resume(id, r);
  }

  refresh(id: string) {
    return this.port.refresh(id);
  }

  /**
   * A held primitive change (AC-2.2, AC-2.4): approving a change whose automatic check failed needs an explicit
   * override note; rejecting keeps the approved definition.
   */
  decidePrimitive(
    id: string,
    change: Pick<McpChangeRecord, "checks" | "primitive">,
    decision: "approve" | "reject",
    note = "",
  ) {
    const failed = change.checks.some((c) => c.outcome === "fail");
    if (decision === "approve" && failed && note.trim() === "")
      return Promise.reject(
        invalid({ note: "Enter an override note" }, "A failed check needs an override note"),
      );
    return this.port.decidePrimitive(id, change.primitive.id, decision, note.trim() || undefined);
  }

  /** The service policy (screen 47): the rules replace the stored ones. */
  putPolicy(id: string, rules: readonly PolicyRuleDraft[]) {
    const e = checkRules(rules);
    if (e) return Promise.reject(e);
    return this.port.putPolicy(id, toRules(rules));
  }

  /** Write-only: the value goes to the port once and is never kept (AC-1.4). */
  setCredential(id: string, scope: string, c: CredentialInput): Promise<McpCredentialRecord> {
    const e = checkCredential(c);
    if (e) return Promise.reject(e);
    return this.port.putCredential(id, scope, c);
  }
}

/** The review queue (screen 49, MCP-US-5): pending servers first, then held primitives, oldest first. */
export class McpReviewUseCases {
  constructor(private readonly port: McpCatalogPort) {}

  async queue(signal?: AbortSignal): Promise<{
    readonly servers: readonly McpReviewRecord[];
    readonly primitives: readonly McpReviewRecord[];
  }> {
    const all = [...(await this.port.reviews(signal))].sort((a, b) =>
      a.since.localeCompare(b.since),
    );
    return {
      servers: all.filter((r) => r.kind === "server"),
      primitives: all.filter((r) => r.kind !== "server"),
    };
  }

  /** Approve, reject or ask for changes, always with a note (AC-5.2); per-tool decisions apply at once. */
  decide(id: string, decision: "approve" | "reject" | "request-changes", input: ReviewInput) {
    const e = checkReview(input);
    if (e) return Promise.reject(e);
    return this.port.review(id, decision, { ...input, note: input.note.trim() });
  }

  queryCapture(signal?: AbortSignal) {
    return this.port.queryCapture(signal);
  }

  /** A time-boxed, audited query capture (AC-9.4); 1 to `maxDays` days with a reason. */
  startCapture(days: number, reason: string, maxDays = 14) {
    const f: Record<string, string> = {};
    if (!Number.isInteger(days) || days < 1 || days > maxDays)
      f.days = `Enter 1 to ${maxDays} days`;
    if (!reason.trim()) f.reason = "Enter the reason";
    if (Object.keys(f).length > 0) return Promise.reject(invalid(f));
    return this.port.startCapture(days, reason.trim());
  }

  stopCapture() {
    return this.port.stopCapture();
  }
}

/** A team's servers as screen 50 groups them. */
export interface TeamMcpServers {
  readonly enterprise: readonly TeamMcpServerRecord[];
  readonly team: readonly TeamMcpServerRecord[];
}

const slugOf = (t: TeamMcpServerRecord) => t.server.slug;

/** A team's MCP servers: switch, register, submit, approve, credentials, OAuth, federation (MCP-US-3, -4, -10). */
export class TeamMcpUseCases {
  constructor(private readonly port: TeamMcpPort) {}

  async servers(teamId: string, signal?: AbortSignal): Promise<TeamMcpServers> {
    const all = await this.port.list(teamId, signal);
    const sort = (xs: TeamMcpServerRecord[]) =>
      xs.sort((a, b) => slugOf(a).localeCompare(slugOf(b)));
    return {
      enterprise: sort(all.filter((t) => t.managed === "enterprise")),
      team: sort(all.filter((t) => t.managed !== "enterprise")),
    };
  }

  detail(teamId: string, id: string, signal?: AbortSignal) {
    return this.port.get(teamId, id, signal);
  }

  primitives(teamId: string, id: string, signal?: AbortSignal) {
    return this.port.primitives(teamId, id, signal);
  }

  /**
   * *Switch on* in full or read-only mode (AC-3.1, AC-3.2). An unpublished server is refused here as the API would
   * (`server_not_published`, AC-3.3), and the shared gateway cannot serve MCP (`team_gateway_required`).
   */
  switchOn(
    teamId: string,
    t: TeamMcpServerRecord,
    mode: "full" | "read_only",
    gatewayDeployment?: string,
  ) {
    if (t.managed === "enterprise" && !t.server.published)
      return Promise.reject(invalid({}, "This server is not published"));
    if (gatewayDeployment === "shared") return Promise.reject(invalid({}, TEAM_GATEWAY_REQUIRED));
    return this.port.put(teamId, t.server.id, true, mode);
  }

  switchOff(teamId: string, t: TeamMcpServerRecord) {
    return this.port.put(teamId, t.server.id, false);
  }

  /** *Register* (screen 51): created as a draft when the team may add servers (AC-4.1); nothing sent otherwise. */
  register(
    teamId: string,
    d: McpServerDraft,
    opts: { readonly mayAdd: boolean; readonly taken?: readonly string[] },
  ): Promise<McpServerRecord> {
    if (!opts.mayAdd) return Promise.reject(invalid({}, TEAM_SERVERS_NOT_ALLOWED));
    const errors = validateMcpServer(d, "team", opts.taken ?? []);
    if (Object.keys(errors).length > 0)
      return Promise.reject(invalid(errors as Record<string, string>));
    return this.port.create(teamId, toCreateTeamMcpServerBody(d));
  }

  submit(teamId: string, id: string) {
    return this.port.submit(teamId, id);
  }

  /** Team approval where the service policy lets team-admins approve this tier (AC-4.3); a note is required. */
  approve(teamId: string, s: McpServerRecord, input: ReviewInput) {
    const block = teamApproveBlock(s);
    if (block) return Promise.reject(invalid({}, block));
    const e = checkReview(input);
    if (e) return Promise.reject(e);
    return this.port.review(teamId, s.id, "approve", { ...input, note: input.note.trim() });
  }

  reject(teamId: string, s: McpServerRecord, input: ReviewInput) {
    const e = checkReview(input);
    if (e) return Promise.reject(e);
    return this.port.review(teamId, s.id, "reject", { ...input, note: input.note.trim() });
  }

  delete(teamId: string, s: Ref) {
    return this.port.delete(teamId, s);
  }

  refresh(teamId: string, id: string) {
    return this.port.refresh(teamId, id);
  }

  decidePrimitive(
    teamId: string,
    id: string,
    primitiveId: string,
    decision: "approve" | "reject",
    note = "",
  ) {
    return this.port.decidePrimitive(teamId, id, primitiveId, decision, note.trim() || undefined);
  }

  putPolicy(teamId: string, id: string, rules: readonly PolicyRuleDraft[]) {
    const e = checkRules(rules);
    if (e) return Promise.reject(e);
    return this.port.putPolicy(teamId, id, toRules(rules));
  }

  /** Write-only: the value goes to the port once and is never kept. */
  setCredential(teamId: string, id: string, c: CredentialInput): Promise<McpCredentialRecord> {
    const e = checkCredential(c);
    if (e) return Promise.reject(e);
    return this.port.putCredential(teamId, id, c);
  }

  /** *Connect*: the authorization URL to open in a new window (MCP-WEB-3); the API keeps the single-use state. */
  async connectOAuth(teamId: string, id: string): Promise<string> {
    const s = await this.port.startOAuth(teamId, id);
    if (!/^https:\/\//.test(s.authorizationUrl))
      throw new AppError({ kind: "unknown", message: "The authorization URL is not https" });
    return s.authorizationUrl;
  }

  disconnectOAuth(teamId: string, id: string) {
    return this.port.disconnectOAuth(teamId, id);
  }

  /** *Test exchange* (AC-10.1): the API reports success or the IdP's error in `federationState`. */
  testFederation(teamId: string, id: string) {
    return this.port.testFederation(teamId, id);
  }

  effective(teamId: string, agentId: string, signal?: AbortSignal) {
    return this.port.effective(teamId, agentId, signal);
  }
}

/** The OAuth outcome the API puts on the console URL after `CompleteMcpOAuthConnect` (contract note 2). */
export function oauthOutcome(
  search: string,
): { readonly ok: boolean; readonly reason?: string } | undefined {
  const q = new URLSearchParams(search);
  const v = q.get("mcpOAuth");
  if (v === "connected") return { ok: true };
  if (v === "failed") {
    const reason = q.get("reason");
    return reason ? { ok: false, reason } : { ok: false };
  }
  return undefined;
}

/** An agent's MCP settings (screen 52; MCP-US-6): saved through `UpdateAgent` `mcp` with `If-Match`. */
export class AgentMcpUseCases {
  constructor(private readonly agents: Pick<AgentsPort, "update">) {}

  /** A stale version is the API's `412 PreconditionFailed`; nothing changes then. */
  save(teamId: string, agent: AgentRecord, spec: AgentMcpSpec, team: readonly McpServerChoice[]) {
    const errors = validateAgentMcp(spec, team);
    if (Object.keys(errors).length > 0)
      return Promise.reject(invalid(errors as Record<string, string>));
    return this.agents.update(
      teamId,
      { id: agent.id, version: agent.version },
      { mcp: toAgentMcpBody(spec) as never },
    );
  }
}

/** The MCP settings an agent holds now (the form's starting point); `search` and `all` by default. */
export function mcpSpecOf(agent: AgentRecord): AgentMcpSpec {
  const m = agent.mcp;
  return {
    access: m?.access === "selected" ? "selected" : "all",
    serverIds: m?.serverIds ?? [],
    mode: m?.mode === "full" ? "full" : "search",
    blocks: (m?.blocks ?? [])
      .filter((b) => b.name !== undefined)
      .map((b) => ({ serverId: b.serverId, name: b.name ?? "" })),
  };
}

/** Totals of a usage report: calls, tool errors and refusals over every row. */
export interface McpUsageTotals {
  readonly calls: number;
  readonly errors: number;
  readonly refusals: number;
  readonly p95Ms: number | null;
}

/** The MCP usage report (screens 53, 55; MCP-US-9). */
export class McpUsageUseCases {
  constructor(private readonly port: McpUsagePort) {}

  run(scope: McpScopeRef, q: McpUsageQuery, signal?: AbortSignal): Promise<McpUsageData> {
    return this.port.run(scope, q, signal);
  }

  csv(scope: McpScopeRef, q: McpUsageQuery, signal?: AbortSignal): Promise<string> {
    return this.port.csv(scope, q, signal);
  }

  static totals(rows: readonly McpUsageRowRecord[]): McpUsageTotals {
    const p95 = rows.map((r) => r.p95Ms).filter((x): x is number => typeof x === "number");
    return {
      calls: rows.reduce((a, r) => a + r.calls, 0),
      errors: rows.reduce((a, r) => a + r.errors, 0),
      refusals: rows.reduce((a, r) => a + r.refusals, 0),
      p95Ms: p95.length > 0 ? Math.max(...p95) : null,
    };
  }

  /** The `n` rows with most calls, for the bar lists (screens 53, 55). */
  static top(rows: readonly McpUsageRowRecord[], n = 8): McpUsageRowRecord[] {
    return [...rows]
      .sort((a, b) => b.calls - a.calls || a.label.localeCompare(b.label))
      .slice(0, n);
  }

  /** Calls per server key, for the catalog's *Calls, 30 d* columns (contract note 5). */
  static callsBy(r: McpUsageData): ReadonlyMap<string, number> {
    return new Map(r.rows.map((x) => [x.key, x.calls]));
  }
}

/** An agent's federated identities (PRD Appendix C). */
export class FederatedIdentitiesUseCases {
  constructor(private readonly port: FederatedIdentitiesPort) {}

  list(teamId: string, agentId: string, signal?: AbortSignal) {
    return this.port.list(teamId, agentId, signal);
  }

  put(
    teamId: string,
    agentId: string,
    d: FederatedIdentityDraft,
    existing: readonly string[],
  ): Promise<FederatedIdentityRecord> {
    const errors = validateFederatedIdentity(d, existing);
    if (Object.keys(errors).length > 0)
      return Promise.reject(invalid(errors as Record<string, string>));
    return this.port.put(teamId, agentId, d.name, {
      audience: d.audience.trim(),
      expirationSeconds: Number(d.expirationSeconds),
    });
  }

  delete(teamId: string, agentId: string, f: Pick<FederatedIdentityRecord, "name" | "version">) {
    return this.port.delete(teamId, agentId, { name: f.name, version: f.version });
  }
}
