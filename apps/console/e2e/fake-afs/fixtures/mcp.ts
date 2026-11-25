// Governed MCP servers (API contract §4.14, 1.3.0 / contract 1.6.0): the catalog, reviews, team switches and
// team servers, inventory and drift, credentials (metadata only), usage reports and federated identities.
// Example hosts only; no real credential, account or tenant value appears here.
import { AGENT_IDS } from "./agents.js";
import { TEAMS } from "./core.js";
import type { Fixture, FixtureContext, FixtureResponse } from "./index.js";

type Json = Record<string, unknown>;
const ts = "2026-11-21T18:00:00Z";
const later = "2026-11-25T10:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const mcp = (n: string) => `mcp_${NS}00${n}`;
const mpr = (n: string) => `mpr_${NS}${n}`;
const PAYMENTS = TEAMS[0].id;
const PLATFORM = TEAMS[1].id;
const sha = (c: string) => `sha256:${c.repeat(64).slice(0, 64)}`;

export const MCP_IDS = {
  github: mcp("01"),
  atlassian: mcp("02"),
  awsDocs: mcp("03"),
  handbook: mcp("04"),
  servicenow: mcp("05"),
  ledger: mcp("10"),
  vendorRisk: mcp("11"),
  fxRates: mcp("12"),
} as const;

const check = (name: string, outcome = "pass", detail: string | null = null): Json => ({
  name,
  outcome,
  detail,
  checkedAt: ts,
});
const passing = [
  check("reachability"),
  check("tls"),
  check("protocol_version"),
  check("host_policy"),
  check("inventory"),
  check("description_injection"),
];

const base = (over: Json): Json => ({
  teamId: null,
  scope: "enterprise",
  dataClassification: "internal",
  transport: "streamable_http",
  location: "external",
  authKind: "none",
  credentialMode: "shared",
  reviewStatus: "approved",
  published: true,
  driftPolicy: "hold",
  credentialState: "not_required",
  defaultForNewTeams: false,
  trustAnnotations: true,
  allowSampling: false,
  protocolVersion: "2025-06-18",
  checks: passing,
  riskTier: "low",
  riskReasons: [],
  approver: null,
  suspendedReason: null,
  docUrl: null,
  federation: null,
  hosted: null,
  adoption: { teams: 1, agents: 2 },
  version: 1,
  createdAt: ts,
  createdBy: "svc-admin",
  updatedAt: ts,
  ...over,
});

const seedServers = (): Json[] => [
  base({
    id: MCP_IDS.github,
    slug: "github",
    displayName: "GitHub",
    owner: "Developer platform",
    purpose: "Issues, pull requests and code search",
    url: "https://mcp.github.example.test/mcp",
    authKind: "oauth_user",
    credentialMode: "per_team",
    credentialState: "set",
    dataClassification: "confidential",
    riskTier: "elevated",
    riskReasons: ["Has destructive tools (delete_branch)", "Reaches an external host"],
    defaultForNewTeams: true,
    adoption: { teams: 2, agents: 4 },
  }),
  base({
    id: MCP_IDS.atlassian,
    slug: "atlassian",
    displayName: "Atlassian",
    owner: "Collaboration tools",
    purpose: "Jira issues and Confluence pages",
    url: "https://mcp.atlassian.example.test/v1/mcp",
    authKind: "oauth_client",
    credentialState: "set",
    riskTier: "elevated",
    riskReasons: ["Reaches an external host"],
  }),
  base({
    id: MCP_IDS.awsDocs,
    slug: "aws-docs",
    displayName: "AWS documentation",
    owner: "Cloud platform",
    purpose: "Search the AWS documentation",
    transport: "hosted",
    location: "in_namespace",
    url: null,
    dataClassification: "public",
    hosted: {
      imageDigest: `registry.example.test/mcp/aws-docs@${sha("a").slice(7)}`,
      instanceMode: "per_team",
      args: [],
      egressHosts: ["docs.aws.example.test"],
      envNames: [],
      needsAws: false,
    },
    checks: [...passing, check("image_signature"), check("image_digest"), check("image_scan")],
    adoption: { teams: 2, agents: 3 },
  }),
  base({
    id: MCP_IDS.handbook,
    slug: "eng-handbook",
    displayName: "Engineering handbook",
    owner: "Engineering enablement",
    purpose: "Search the internal engineering handbook",
    location: "corporate",
    url: "https://handbook.corp.example.test/mcp",
    authKind: "workload_federation",
    credentialMode: "per_team",
    federation: {
      issuer: "https://oidc.eks.example.test/id/EXAMPLE",
      audience: "api://eng-handbook",
      tokenEndpoint: "https://login.corp.example.test/oauth2/token",
      subjectTemplate: "system:serviceaccount:afs-t-{teamSlug}:afs-gateway",
    },
    adoption: { teams: 0, agents: 0 },
  }),
  base({
    id: MCP_IDS.servicenow,
    slug: "servicenow",
    displayName: "ServiceNow",
    owner: "IT service management",
    purpose: "Incidents and change requests",
    url: "https://mcp.servicenow.example.test/mcp",
    authKind: "static",
    authHeader: "Authorization",
    credentialState: "missing",
    reviewStatus: "draft",
    published: false,
    riskTier: "high",
    riskReasons: ["Has destructive tools (close_incident)", "Data classification is restricted"],
    dataClassification: "restricted",
    checks: [
      check("reachability"),
      check("tls"),
      check("description_injection", "warn", "A tool description asks the model to ignore rules"),
    ],
    adoption: { teams: 0, agents: 0 },
  }),
  base({
    id: MCP_IDS.ledger,
    teamId: PAYMENTS,
    scope: "team",
    slug: "ledger-schema",
    displayName: "Ledger schema",
    owner: "Marcus Chen",
    purpose: "Read the ledger database schema for the review agents",
    location: "corporate",
    url: "https://ledger-mcp.corp.example.test/mcp",
    createdBy: "team-admin",
    adoption: { teams: 1, agents: 1 },
  }),
  base({
    id: MCP_IDS.vendorRisk,
    teamId: PAYMENTS,
    scope: "team",
    slug: "vendor-risk-api",
    displayName: "Vendor risk API",
    owner: "Marcus Chen",
    purpose: "Look up vendor risk scores before a payment run",
    url: "https://mcp.vendor-risk.example.test/mcp",
    authKind: "static",
    authHeader: "X-Api-Key",
    credentialMode: "per_team",
    credentialState: "set",
    dataClassification: "confidential",
    reviewStatus: "pending_review",
    published: false,
    riskTier: "high",
    riskReasons: ["Reaches an external host", "Data classification is confidential"],
    approver: "security",
    createdBy: "team-admin",
    adoption: { teams: 0, agents: 0 },
  }),
  base({
    id: MCP_IDS.fxRates,
    teamId: PAYMENTS,
    scope: "team",
    slug: "fx-rates",
    displayName: "FX rates",
    owner: "Marcus Chen",
    purpose: "Daily currency rates",
    url: "https://fx.example.test/mcp",
    dataClassification: "public",
    reviewStatus: "draft",
    published: false,
    riskTier: null,
    checks: [],
    createdBy: "team-admin",
    adoption: { teams: 0, agents: 0 },
  }),
];

const prim = (serverId: string, n: string, name: string, over: Json = {}, kind = "tool"): Json => ({
  id: mpr(n),
  serverId,
  kind,
  name,
  title: null,
  digest: sha(n.slice(-1).toLowerCase()),
  approvedDigest: sha(n.slice(-1).toLowerCase()),
  status: "approved",
  change: null,
  annotations: { readOnlyHint: true },
  firstSeen: ts,
  lastSeen: later,
  ...over,
});
const seedPrimitives = (): Map<string, Json[]> =>
  new Map([
    [
      MCP_IDS.github,
      [
        prim(MCP_IDS.github, "0101", "search_code"),
        prim(MCP_IDS.github, "0102", "list_issues"),
        prim(MCP_IDS.github, "0103", "create_issue", { annotations: { readOnlyHint: false } }),
        prim(MCP_IDS.github, "0104", "delete_branch", {
          status: "blocked",
          annotations: { destructiveHint: true },
        }),
        prim(MCP_IDS.github, "0105", "merge_pull_request", {
          status: "pending_review",
          change: "incompatible",
          digest: sha("e"),
          annotations: { destructiveHint: true },
        }),
      ],
    ],
    [
      MCP_IDS.atlassian,
      [
        prim(MCP_IDS.atlassian, "0201", "jira_search"),
        prim(MCP_IDS.atlassian, "0202", "confluence_get_page"),
      ],
    ],
    [MCP_IDS.awsDocs, [prim(MCP_IDS.awsDocs, "0301", "search_documentation")]],
    [MCP_IDS.handbook, [prim(MCP_IDS.handbook, "0401", "search_handbook")]],
    [
      MCP_IDS.servicenow,
      [
        prim(MCP_IDS.servicenow, "0501", "get_incident", {
          status: "pending_review",
          change: "new",
          approvedDigest: null,
        }),
        prim(MCP_IDS.servicenow, "0502", "close_incident", {
          status: "pending_review",
          change: "new",
          approvedDigest: null,
          annotations: { destructiveHint: true },
        }),
      ],
    ],
    [
      MCP_IDS.ledger,
      [prim(MCP_IDS.ledger, "1001", "describe_table"), prim(MCP_IDS.ledger, "1002", "list_tables")],
    ],
    [
      MCP_IDS.vendorRisk,
      [
        prim(MCP_IDS.vendorRisk, "1101", "get_vendor_score", {
          status: "pending_review",
          change: "new",
          approvedDigest: null,
        }),
        prim(MCP_IDS.vendorRisk, "1102", "flag_vendor", {
          status: "pending_review",
          change: "new",
          approvedDigest: null,
          annotations: { openWorldHint: true },
        }),
      ],
    ],
    [MCP_IDS.fxRates, []],
  ]);

interface Switch {
  enabled: boolean;
  mode: "full" | "read_only";
  credential: Json | null;
  federationState: string | null;
}
const credential = (scope: string, state: string, over: Json = {}): Json => ({
  scope,
  state,
  scopes: [],
  subject: null,
  rotatedAt: state === "set" ? ts : null,
  expiresAt: null,
  ...over,
});
const sw = (over: Partial<Switch>): Switch => ({
  enabled: false,
  mode: "full",
  credential: null,
  federationState: null,
  ...over,
});
const seedSwitches = (): Map<string, Map<string, Switch>> =>
  new Map([
    [
      PAYMENTS,
      new Map([
        [
          MCP_IDS.github,
          sw({
            enabled: true,
            credential: credential(PAYMENTS, "set", {
              kind: "oauth_user",
              scopes: ["repo", "read:org"],
              subject: "svc-payments-bot",
              expiresAt: "2026-12-21T18:00:00Z",
            }),
          }),
        ],
        [
          MCP_IDS.atlassian,
          sw({
            enabled: true,
            mode: "read_only",
            credential: credential("_shared", "set", { kind: "oauth_client" }),
          }),
        ],
        [MCP_IDS.awsDocs, sw({ enabled: true, credential: credential("_shared", "not_required") })],
        [MCP_IDS.handbook, sw({ federationState: "unknown" })],
        [MCP_IDS.ledger, sw({ enabled: true, credential: credential(PAYMENTS, "not_required") })],
        [MCP_IDS.vendorRisk, sw({ credential: credential(PAYMENTS, "set", { kind: "static" }) })],
        [MCP_IDS.fxRates, sw({ credential: credential(PAYMENTS, "not_required") })],
      ]),
    ],
    [
      PLATFORM,
      new Map([
        [
          MCP_IDS.github,
          sw({
            enabled: true,
            credential: credential(PLATFORM, "missing", { kind: "oauth_user" }),
          }),
        ],
        [MCP_IDS.awsDocs, sw({ enabled: true, credential: credential("_shared", "not_required") })],
      ]),
    ],
  ]);

const fedKey = (teamId: string, agentId: string) => `${teamId}/${agentId}`;
const fedIdentity = (teamId: string, name: string, audience: string, seconds: number): Json => ({
  name,
  audience,
  expirationSeconds: seconds,
  filePath: `/var/run/secrets/afs/federation/${name}/token`,
  envVar: `AFS_FEDERATED_TOKEN_FILE_${name.toUpperCase().replace(/-/g, "_")}`,
  issuer: "https://oidc.eks.example.test/id/EXAMPLE",
  subject: `system:serviceaccount:afs-t-${teamId === PAYMENTS ? "payments" : "platform"}:agent`,
  version: 1,
  createdAt: ts,
  createdBy: "team-admin",
});
const seedFederated = (): Map<string, Json[]> =>
  new Map([
    [
      fedKey(PAYMENTS, AGENT_IDS[0]),
      [fedIdentity(PAYMENTS, "entra", "api://payments-reporting", 3600)],
    ],
  ]);

let servers = seedServers();
let primitives = seedPrimitives();
let switches = seedSwitches();
let federated = seedFederated();
let capture: Json | null = null;
let created = 0;
export const resetMcp = (): void => {
  servers = seedServers();
  primitives = seedPrimitives();
  switches = seedSwitches();
  federated = seedFederated();
  capture = null;
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
const bump = (s: Json, over: Json): Json => ({
  ...s,
  ...over,
  version: Number(s.version) + 1,
  updatedAt: later,
});
const ok = (body: unknown, status = 200): FixtureResponse => ({ status, body });
const bodyOf = (ctx: FixtureContext): Json => (ctx.body ?? {}) as Json;

const findServer = (id: string | undefined) => servers.findIndex((s) => s.id === id);
/** A server the team may see: an enterprise server, or one of its own team servers. */
const teamServer = (ctx: FixtureContext): { i: number; s: Json | undefined } => {
  const i = findServer(ctx.params.mcpServerId);
  const s = servers[i];
  if (!s || (s.teamId !== null && s.teamId !== ctx.params.teamId)) return { i: -1, s: undefined };
  return { i, s };
};
const enterpriseServer = (ctx: FixtureContext): { i: number; s: Json | undefined } => {
  const i = findServer(ctx.params.mcpServerId);
  return { i, s: servers[i] };
};
const switchOf = (teamId: string, serverId: string): Switch => {
  let t = switches.get(teamId);
  if (!t) {
    t = new Map();
    switches.set(teamId, t);
  }
  let s = t.get(serverId);
  if (!s) {
    s = sw({});
    t.set(serverId, s);
  }
  return s;
};
const teamView = (teamId: string, s: Json): Json => {
  const x = switchOf(teamId, String(s.id));
  const team = s.scope === "team";
  const state = team
    ? s.reviewStatus === "approved"
      ? "on"
      : s.reviewStatus === "pending_review"
        ? "pending"
        : "off"
    : x.enabled
      ? "on"
      : "off";
  return {
    server: s,
    enabled: team ? s.reviewStatus === "approved" : x.enabled,
    mode: x.mode,
    state,
    managed: team ? "team" : "enterprise",
    credential: x.credential,
    federationState: s.authKind === "workload_federation" ? (x.federationState ?? "unknown") : null,
    updatedAt: ts,
  };
};
const teamItems = (teamId: string): Json[] =>
  servers
    .filter((s) => (s.scope === "enterprise" && s.published === true) || s.teamId === teamId)
    .map((s) => teamView(teamId, s));

const reviewItems = (): Json[] => [
  ...servers
    .filter((s) => s.reviewStatus === "pending_review")
    .map((s) => ({
      kind: "server",
      serverId: s.id,
      teamId: s.teamId,
      slug: s.slug,
      name: null,
      primitiveId: null,
      approver: s.approver ?? "security",
      riskTier: s.riskTier,
      riskReasons: s.riskReasons,
      since: ts,
    })),
  ...servers
    .filter((s) => s.reviewStatus === "approved")
    .flatMap((s) =>
      (primitives.get(String(s.id)) ?? [])
        .filter((p) => p.status === "pending_review")
        .map((p) => ({
          kind: "primitive",
          serverId: s.id,
          teamId: s.teamId,
          slug: s.slug,
          name: p.name,
          primitiveId: p.id,
          approver: s.scope === "team" ? "team_admin" : "security",
          riskTier: s.riskTier,
          riskReasons: [],
          since: ts,
        })),
    ),
];

const setStatus =
  (status: string, over: Json = {}) =>
  (ctx: FixtureContext) => {
    const { i, s } = ctx.params.teamId ? teamServer(ctx) : enterpriseServer(ctx);
    if (!s) return notFound("MCP server");
    const b = bodyOf(ctx);
    if (["approve", "reject", "request-changes"].includes(status) && !b.note)
      return err(400, "ValidationError", "A note is required", "note_required");
    const next = (() => {
      switch (status) {
        case "approve":
          decidePrimitives(String(s.id), b);
          return bump(s, {
            reviewStatus: "approved",
            published: s.scope === "team" ? true : s.published,
            approver: null,
          });
        case "reject":
          return bump(s, { reviewStatus: "rejected", approver: null });
        case "request-changes":
          return bump(s, { reviewStatus: "draft", approver: null });
        case "submit":
          if (s.reviewStatus !== "draft" && s.reviewStatus !== "rejected") return undefined;
          return bump(s, {
            reviewStatus: "pending_review",
            approver: s.riskTier === "low" || s.riskTier === null ? "team_admin" : "security",
            checks: passing,
            riskTier: s.riskTier ?? "low",
          });
        default:
          return bump(s, over);
      }
    })();
    if (!next)
      return err(409, "Conflict", "Only a draft or rejected server is submitted", "invalid_state");
    servers[i] = next;
    return ok(next, status === "refresh" ? 202 : 200);
  };

function decidePrimitives(serverId: string, b: Json): void {
  const ds = (b.primitives as { primitiveId: string; decision: string }[] | undefined) ?? [];
  const list = primitives.get(serverId) ?? [];
  primitives.set(
    serverId,
    list.map((p) => {
      const d = ds.find((x) => x.primitiveId === p.id);
      if (d?.decision === "block") return { ...p, status: "blocked" };
      if (p.status === "pending_review")
        return { ...p, status: "approved", change: null, approvedDigest: p.digest };
      return p;
    }),
  );
}

const decidePrimitive = (approve: boolean) => (ctx: FixtureContext) => {
  const { s } = ctx.params.teamId ? teamServer(ctx) : enterpriseServer(ctx);
  if (!s) return notFound("MCP server");
  const list = primitives.get(String(s.id)) ?? [];
  const i = list.findIndex((p) => p.id === ctx.params.primitiveId);
  const p = list[i];
  if (!p) return notFound("Primitive");
  const next = approve
    ? { ...p, status: "approved", change: null, approvedDigest: p.digest }
    : { ...p, status: "blocked" };
  list[i] = next;
  return ok(next);
};

const SLUG = /^[a-z][a-z0-9-]{1,30}$/;
function createServer(b: Json, teamId: string | null, by: string): FixtureResponse {
  const slug = String(b.slug ?? "");
  if (slug === "afs") return err(400, "ValidationError", "afs is reserved", "slug_reserved");
  if (!SLUG.test(slug)) return err(400, "ValidationError", "Invalid server name", "slug_invalid");
  if (servers.some((s) => s.slug === slug && (s.teamId === null || s.teamId === teamId)))
    return err(409, "Conflict", `The server name ${slug} is already used`, "slug_taken");
  if (teamId === PLATFORM)
    return err(
      403,
      "AccessDenied",
      "This team may not register its own MCP servers",
      "team_servers_not_allowed",
    );
  created += 1;
  const s = base({
    id: mcp(String(20 + created)),
    teamId,
    scope: teamId ? "team" : "enterprise",
    slug,
    displayName: String(b.displayName ?? slug),
    owner: typeof b.owner === "string" ? b.owner : by,
    purpose: typeof b.purpose === "string" ? b.purpose : "",
    url: typeof b.url === "string" ? b.url : null,
    transport: b.transport ?? "streamable_http",
    location: b.location ?? "external",
    authKind: b.authKind ?? "none",
    authHeader: typeof b.authHeader === "string" ? b.authHeader : null,
    credentialMode: b.credentialMode ?? "shared",
    dataClassification: b.dataClassification ?? "internal",
    credentialState: b.authKind === "none" || b.authKind === undefined ? "not_required" : "missing",
    driftPolicy: b.driftPolicy ?? "hold",
    reviewStatus: "draft",
    published: false,
    riskTier: null,
    riskReasons: [],
    checks: [],
    federation: (b.federation as Json | undefined) ?? null,
    hosted: (b.hosted as Json | undefined) ?? null,
    createdBy: by,
    adoption: { teams: 0, agents: 0 },
  });
  servers.push(s);
  primitives.set(String(s.id), []);
  return ok(s, 201);
}

const usage = (ctx: FixtureContext, teamId: string | null): FixtureResponse => {
  const view = ctx.query.get("view") ?? "usage";
  const groupBy = ctx.query.get("groupBy") ?? "server";
  const windowDays = Number(ctx.query.get("window") ?? "") || null;
  const visible = servers.filter(
    (s) =>
      s.reviewStatus === "approved" &&
      (teamId === null || s.teamId === null || s.teamId === teamId),
  );
  const row = (key: string, label: string, n: number, over: Json = {}): Json => ({
    key,
    label,
    calls: n,
    errors: Math.round(n * 0.02),
    refusals: Math.round(n * 0.01),
    p50Ms: 180,
    p95Ms: 900,
    lastUsedAt: later,
    searches: null,
    searchHitRate: null,
    teams: null,
    agents: null,
    ...over,
  });
  const calls = (i: number) => (teamId ? 400 : 1200) - i * 150;
  let rows: Json[];
  switch (groupBy) {
    case "team":
      rows = TEAMS.filter((t) => teamId === null || t.id === teamId).map((t, i) =>
        row(t.id, t.slug, 2400 - i * 900),
      );
      break;
    case "agent":
      rows = AGENT_IDS.map((a, i) =>
        row(a, ["reviewer", "triage", "deploy"][i] ?? a, 300 - i * 80),
      );
      break;
    case "day":
      rows = [19, 20, 21, 22, 23, 24, 25].map((d, i) =>
        row(`2026-11-${d}`, `2026-11-${d}`, 200 + i * 20),
      );
      break;
    case "primitive":
      rows = visible.flatMap((s) =>
        (primitives.get(String(s.id)) ?? []).map((p, i) =>
          row(`${s.slug}/${p.name}`, `${s.slug} · ${p.name}`, 300 - i * 40),
        ),
      );
      break;
    default:
      rows = visible.map((s, i) => row(String(s.id), String(s.slug), Math.max(calls(i), 20)));
  }
  if (view === "unused")
    rows = visible
      .flatMap((s) =>
        (primitives.get(String(s.id)) ?? []).filter((p) => p.status === "approved").slice(1),
      )
      .map((p) => row(String(p.id), String(p.name), 0, { lastUsedAt: null }));
  if (view === "refusals")
    rows = rows.map((r) => ({ ...r, refusals: Math.round(Number(r.calls) * 0.05) }));
  if (view === "discovery")
    rows = rows.map((r) => ({ ...r, searches: Number(r.calls) * 2, searchHitRate: 0.72 }));
  if (view === "adoption")
    rows = visible.map((s) =>
      row(String(s.id), String(s.slug), 0, {
        teams: (s.adoption as Json).teams,
        agents: (s.adoption as Json).agents,
      }),
    );
  return ok({
    view,
    groupBy,
    windowDays,
    from: "2026-10-26T00:00:00Z",
    to: "2026-11-25T00:00:00Z",
    rows,
  });
};

const effective = (ctx: FixtureContext, kind: "agent" | "pool"): FixtureResponse => {
  const teamId = ctx.params.teamId ?? "";
  const id = ctx.params.agentId ?? ctx.params.poolId ?? "";
  const on = teamItems(teamId).filter((t) => t.state === "on");
  return ok({
    subjectKind: kind,
    subjectId: id,
    access: "all",
    mode: "search",
    env: ["AFS_MCP_URL", "AFS_MCP_MODE", "AFS_MCP_CONFIG_FILE"],
    servers: on.map((t) => {
      const s = t.server as Json;
      return {
        serverId: s.id,
        slug: s.slug,
        scope: s.scope,
        mode: t.mode,
        url: `/mcp/${String(s.slug)}`,
        primitives: (primitives.get(String(s.id)) ?? []).map((p) => {
          const allowed =
            p.status === "approved" &&
            !(t.mode === "read_only" && (p.annotations as Json).readOnlyHint !== true);
          return {
            name: p.name,
            kind: p.kind,
            allowed,
            level: allowed ? null : p.status === "approved" ? "team" : "service",
            reason: allowed
              ? null
              : p.status === "pending_review"
                ? "primitive_pending_review"
                : p.status === "blocked"
                  ? "primitive_blocked"
                  : "read_only_mode",
            rateLimitPerMinute: null,
          };
        }),
      };
    }),
  });
};

const fedList = (ctx: FixtureContext) => {
  const k = fedKey(ctx.params.teamId ?? "", ctx.params.agentId ?? ctx.params.poolId ?? "");
  let list = federated.get(k);
  if (!list) {
    list = [];
    federated.set(k, list);
  }
  return list;
};
const NAME = /^[a-z][a-z0-9-]{0,30}$/;
const putFederated = (ctx: FixtureContext): FixtureResponse => {
  const name = ctx.params.name ?? "";
  const b = bodyOf(ctx);
  if (!NAME.test(name)) return err(400, "ValidationError", "Invalid name", "invalid_name");
  const audience = String(b.audience ?? "");
  if (audience === "sts.amazonaws.com" || audience === "afs-gateway")
    return err(400, "ValidationError", "This audience is reserved", "audience_not_allowed");
  const list = fedList(ctx);
  const i = list.findIndex((f) => f.name === name);
  const prior = list[i];
  const next = {
    ...fedIdentity(ctx.params.teamId ?? "", name, audience, Number(b.expirationSeconds ?? 3600)),
    version: prior ? Number(prior.version) + 1 : 1,
  };
  if (prior) list[i] = next;
  else {
    if (list.length >= 10)
      return err(409, "Conflict", "At most 10 federated identities", "federated_identity_limit");
    list.push(next);
  }
  return ok(next);
};
const deleteFederated = (ctx: FixtureContext): FixtureResponse => {
  const list = fedList(ctx);
  const i = list.findIndex((f) => f.name === ctx.params.name);
  if (i < 0) return notFound("Federated identity");
  list.splice(i, 1);
  return { status: 204 };
};

const eventList = (): FixtureResponse => ok({ items: [], nextToken: null });

export const mcpFixtures: readonly Fixture[] = [
  // Service catalog (SM1-SM3)
  {
    method: "GET",
    path: "/v1/mcp-servers",
    response: (ctx) => {
      const scope = ctx.query.get("scope");
      const status = ctx.query.get("reviewStatus");
      return ok({
        items: servers.filter(
          (s) =>
            (!scope || scope === "all" || s.scope === scope) &&
            (!status || s.reviewStatus === status),
        ),
        nextToken: null,
      });
    },
  },
  {
    method: "POST",
    path: "/v1/mcp-servers",
    response: (ctx) => createServer(bodyOf(ctx), null, ctx.principal?.id ?? "svc-admin"),
  },
  {
    method: "POST",
    path: "/v1/mcp-servers:import",
    response: (ctx) => {
      const b = bodyOf(ctx);
      const m = (b.manifest ?? {}) as Json;
      const name = typeof m.name === "string" ? m.name : "";
      if (!name)
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "The manifest has no name",
            requestId: "req_fake_400",
            details: {
              fields: [
                {
                  field: "manifest",
                  message: "The manifest has no name",
                  reason: "manifest_invalid",
                },
              ],
            },
          },
        };
      const derived = (name.split("/").pop() ?? name).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const remote = ((m.remotes as Json[] | undefined) ?? [])[0];
      return createServer(
        {
          slug: typeof b.slug === "string" ? b.slug : derived,
          displayName: typeof m.title === "string" ? m.title : derived,
          purpose: typeof m.description === "string" ? m.description : "",
          url: typeof remote?.url === "string" ? remote.url : null,
        },
        null,
        ctx.principal?.id ?? "svc-admin",
      );
    },
  },
  {
    method: "GET",
    path: "/v1/mcp-servers/{mcpServerId}",
    response: (ctx) => {
      const { s } = enterpriseServer(ctx);
      return s ? ok(s) : notFound("MCP server");
    },
  },
  {
    method: "PATCH",
    path: "/v1/mcp-servers/{mcpServerId}",
    response: (ctx) => {
      const { i, s } = enterpriseServer(ctx);
      if (!s) return notFound("MCP server");
      const next = bump(s, bodyOf(ctx));
      servers[i] = next;
      return ok(next);
    },
  },
  {
    method: "DELETE",
    path: "/v1/mcp-servers/{mcpServerId}",
    response: (ctx) => {
      const { i, s } = enterpriseServer(ctx);
      if (!s) return notFound("MCP server");
      if (s.published === true)
        return err(409, "Conflict", "Retire the server before deleting it", "server_published");
      servers.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}:publish",
    response: setStatus("publish", { published: true, reviewStatus: "approved" }),
  },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}:retire",
    response: setStatus("retire", { published: false }),
  },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}:suspend",
    response: (ctx) => {
      const reason = String(bodyOf(ctx).reason ?? "");
      return setStatus("suspend", { reviewStatus: "suspended", suspendedReason: reason })(ctx);
    },
  },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}:resume",
    response: setStatus("resume", { reviewStatus: "approved", suspendedReason: null }),
  },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}:refresh",
    response: setStatus("refresh", {}),
  },
  { method: "POST", path: "/v1/mcp-servers/{mcpServerId}:approve", response: setStatus("approve") },
  { method: "POST", path: "/v1/mcp-servers/{mcpServerId}:reject", response: setStatus("reject") },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}:request-changes",
    response: setStatus("request-changes"),
  },
  {
    method: "GET",
    path: "/v1/mcp-servers/{mcpServerId}/primitives",
    response: (ctx) => {
      const { s } = enterpriseServer(ctx);
      if (!s) return notFound("MCP server");
      return ok({ items: primitives.get(String(s.id)) ?? [], nextToken: null });
    },
  },
  {
    method: "GET",
    path: "/v1/mcp-servers/{mcpServerId}/primitives/{primitiveId}/change",
    response: (ctx) => {
      const p = (primitives.get(ctx.params.mcpServerId ?? "") ?? []).find(
        (x) => x.id === ctx.params.primitiveId,
      );
      if (!p) return notFound("Primitive");
      const fresh = p.approvedDigest === null;
      return ok({
        primitive: p,
        approvedDefinition: fresh
          ? null
          : { name: p.name, description: "Merge a pull request.", inputSchema: { type: "object" } },
        pendingDefinition: {
          name: p.name,
          description: "Merge a pull request, deleting the branch afterwards.",
          inputSchema: { type: "object", properties: { deleteBranch: { type: "boolean" } } },
        },
        diff: fresh
          ? []
          : [
              {
                field: "description",
                before: "Merge a pull request.",
                after: "Merge a pull request, deleting the branch afterwards.",
              },
              {
                field: "inputSchema.properties.deleteBranch",
                before: null,
                after: { type: "boolean" },
              },
            ],
        checks: [check("description_injection")],
        crossesRiskLine: (p.annotations as Json).destructiveHint === true,
      });
    },
  },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}/primitives/{primitiveId}:approve",
    response: decidePrimitive(true),
  },
  {
    method: "POST",
    path: "/v1/mcp-servers/{mcpServerId}/primitives/{primitiveId}:reject",
    response: decidePrimitive(false),
  },
  {
    method: "PUT",
    path: "/v1/mcp-servers/{mcpServerId}/policy",
    response: (ctx) => {
      const { s } = enterpriseServer(ctx);
      if (!s) return notFound("MCP server");
      const b = bodyOf(ctx);
      return ok({
        serverId: s.id,
        level: "service",
        teamId: null,
        rules: (b.rules as Json[] | undefined) ?? [],
        version: 2,
      });
    },
  },
  {
    method: "PUT",
    path: "/v1/mcp-servers/{mcpServerId}/credentials/{scope}",
    response: (ctx) => {
      const { i, s } = enterpriseServer(ctx);
      if (!s) return notFound("MCP server");
      const scope = ctx.params.scope ?? "_shared";
      servers[i] = { ...s, credentialState: "set" };
      const kind = "clientId" in bodyOf(ctx) ? "oauth_client" : "static";
      if (scope !== "_shared")
        switchOf(scope, String(s.id)).credential = credential(scope, "set", { kind });
      return ok(credential(scope, "set", { kind, rotatedAt: later }));
    },
  },
  // Reviews and query capture (SM4, SM5)
  {
    method: "GET",
    path: "/v1/mcp-reviews",
    response: () => ok({ items: reviewItems(), nextToken: null }),
  },
  { method: "GET", path: "/v1/mcp-settings/query-capture", response: () => ok({ capture }) },
  {
    method: "POST",
    path: "/v1/mcp-settings/query-capture:start",
    response: (ctx) => {
      const b = bodyOf(ctx);
      if (capture) return err(409, "Conflict", "A capture window is already open", "capture_open");
      const days = Number(b.days ?? 1);
      capture = {
        id: `mqc_${NS}0001`,
        reason: String(b.reason ?? ""),
        startedAt: later,
        startedBy: ctx.principal?.id ?? "svc-admin",
        until: new Date(Date.parse(later) + days * 86400000).toISOString().replace(".000Z", "Z"),
        stoppedAt: null,
        stoppedBy: null,
      };
      return ok(capture, 201);
    },
  },
  {
    method: "POST",
    path: "/v1/mcp-settings/query-capture:stop",
    response: (ctx) => {
      if (!capture) return err(409, "Conflict", "No capture window is open", "capture_not_open");
      const stopped = { ...capture, stoppedAt: later, stoppedBy: ctx.principal?.id ?? "svc-admin" };
      capture = null;
      return ok(stopped);
    },
  },
  { method: "GET", path: "/v1/reports/mcp", response: (ctx) => usage(ctx, null) },
  { method: "GET", path: "/v1/mcp-events", response: eventList },
  // Team servers (TM1-TM3, TM5, VM1)
  {
    method: "GET",
    path: "/v1/teams/{teamId}/mcp-servers",
    response: (ctx) => {
      const state = ctx.query.get("state");
      return ok({
        items: teamItems(ctx.params.teamId ?? "").filter((t) => !state || t.state === state),
        nextToken: null,
      });
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers",
    response: (ctx) => {
      const teamId = ctx.params.teamId ?? "";
      const r = createServer(bodyOf(ctx), teamId, ctx.principal?.id ?? "team-admin");
      if (r.status === 201) switchOf(teamId, String((r.body as Json).id));
      return r;
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}",
    response: (ctx) => {
      const { s } = teamServer(ctx);
      return s ? ok(teamView(ctx.params.teamId ?? "", s)) : notFound("MCP server");
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}",
    response: (ctx) => {
      const { s } = teamServer(ctx);
      if (!s) return notFound("MCP server");
      if (s.scope === "enterprise" && s.published !== true)
        return err(409, "Conflict", "The server is not published", "server_not_published");
      const b = bodyOf(ctx);
      const x = switchOf(ctx.params.teamId ?? "", String(s.id));
      x.enabled = b.enabled === true;
      if (b.mode === "full" || b.mode === "read_only") x.mode = b.mode;
      if (x.credential === null)
        x.credential = credential(
          s.credentialMode === "shared" ? "_shared" : (ctx.params.teamId ?? ""),
          s.authKind === "none" ? "not_required" : "missing",
        );
      return ok(teamView(ctx.params.teamId ?? "", s));
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}",
    response: (ctx) => {
      const { i, s } = teamServer(ctx);
      if (s?.scope !== "team") return notFound("MCP server");
      const next = bump(s, bodyOf(ctx));
      servers[i] = next;
      return ok(next);
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}",
    response: (ctx) => {
      const { i, s } = teamServer(ctx);
      if (s?.scope !== "team") return notFound("MCP server");
      servers.splice(i, 1);
      return { status: 204 };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/credential",
    response: (ctx) => {
      const { i, s } = teamServer(ctx);
      if (!s) return notFound("MCP server");
      const teamId = ctx.params.teamId ?? "";
      const kind = "clientId" in bodyOf(ctx) ? "oauth_client" : "static";
      const c = credential(teamId, "set", { kind, rotatedAt: later });
      switchOf(teamId, String(s.id)).credential = c;
      if (s.scope === "team") servers[i] = { ...s, credentialState: "set" };
      return ok(c);
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/federation:test",
    response: (ctx) => {
      const { s } = teamServer(ctx);
      if (!s) return notFound("MCP server");
      switchOf(ctx.params.teamId ?? "", String(s.id)).federationState = "ok";
      return ok(teamView(ctx.params.teamId ?? "", s), 202);
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/oauth:start",
    response: (ctx) => {
      const { s } = teamServer(ctx);
      if (!s) return notFound("MCP server");
      return ok({
        authorizationUrl: `https://auth.example.test/authorize?client_id=afs&state=fake-${String(s.slug)}`,
        state: `fake-${String(s.slug)}`,
        expiresAt: later,
      });
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/oauth:disconnect",
    response: (ctx) => {
      const { s } = teamServer(ctx);
      if (!s) return notFound("MCP server");
      const teamId = ctx.params.teamId ?? "";
      const c = credential(teamId, "missing", { kind: "oauth_user" });
      switchOf(teamId, String(s.id)).credential = c;
      return ok(c);
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/policy",
    response: (ctx) => {
      const { s } = teamServer(ctx);
      if (!s) return notFound("MCP server");
      return ok({
        serverId: s.id,
        level: "team",
        teamId: ctx.params.teamId ?? null,
        rules: (bodyOf(ctx).rules as Json[] | undefined) ?? [],
        version: 2,
      });
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/primitives",
    response: (ctx) => {
      const { s } = teamServer(ctx);
      if (!s) return notFound("MCP server");
      return ok({ items: primitives.get(String(s.id)) ?? [], nextToken: null });
    },
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/primitives/{primitiveId}:approve",
    response: decidePrimitive(true),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}/primitives/{primitiveId}:reject",
    response: decidePrimitive(false),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}:approve",
    response: setStatus("approve"),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}:reject",
    response: setStatus("reject"),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}:refresh",
    response: setStatus("refresh", {}),
  },
  {
    method: "POST",
    path: "/v1/teams/{teamId}/mcp-servers/{mcpServerId}:submit",
    response: setStatus("submit"),
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/reports/mcp",
    response: (ctx) => usage(ctx, ctx.params.teamId ?? null),
  },
  { method: "GET", path: "/v1/teams/{teamId}/mcp-events", response: eventList },
  // Agents and pools (TM4, federated identities)
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/mcp",
    response: (ctx) => effective(ctx, "agent"),
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/mcp",
    response: (ctx) => effective(ctx, "pool"),
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/federated-identities",
    response: (ctx) => ok({ items: fedList(ctx), nextToken: null }),
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/agents/{agentId}/federated-identities/{name}",
    response: putFederated,
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/agents/{agentId}/federated-identities/{name}",
    response: deleteFederated,
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/pools/{poolId}/federated-identities",
    response: (ctx) => ok({ items: fedList(ctx), nextToken: null }),
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/pools/{poolId}/federated-identities/{name}",
    response: putFederated,
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}/pools/{poolId}/federated-identities/{name}",
    response: deleteFederated,
  },
];
