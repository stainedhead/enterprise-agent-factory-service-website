// Pure MCP rules (MCP gateway PRD §7 to §11, API contract §4.14, gateway contract §13): the words and badges of a
// server and its primitives, who approves a team server under the service policy, the add and register forms, policy
// rules, an agent's MCP settings and the environment it receives, and the `afs` commands of every form.
import { buildCli, type CliCommand, type CliValue } from "./cli.js";
import { type EnvLine, withBoolFlags } from "./modelEndpoints.js";
import type { Dot, PhaseView } from "./status.js";

export type McpScope = "enterprise" | "team";
export type McpTransport = "streamable_http" | "hosted";
export type McpLocation = "external" | "corporate" | "in_namespace";
export type McpAuthKind =
  | "none"
  | "static"
  | "oauth_client"
  | "workload_federation"
  | "oauth_user"
  | "aws_sigv4";
export type DataClassification = "public" | "internal" | "confidential" | "restricted";
export type ApprovalPolicy = "team_all" | "team_low_security_higher" | "security_all";
export type RiskTier = "low" | "elevated" | "high";
export type AgentMcpMode = "search" | "full";
export type AnnotationClass = "read_only" | "destructive" | "open_world";

/** `afs` is the aggregated endpoint's name (gateway contract §13.1). */
export const RESERVED_MCP_SLUG = "afs";
const SLUG = /^[a-z][a-z0-9-]{1,30}$/;

// ---------------------------------------------------------------------------------------------------------------
// Words and status views

/** `Enterprise` or `Team-managed`, as every MCP screen labels a server. */
export const kindWord = (scope: string): string =>
  scope === "team" ? "Team-managed" : "Enterprise";

const RISK: Record<string, { word: string; dot: Dot }> = {
  low: { word: "Low", dot: "green" },
  elevated: { word: "Elevated", dot: "amber" },
  high: { word: "High", dot: "red" },
};
/** The risk tier of a team server; `—` for enterprise servers, which have none. */
export const riskView = (tier: string | null | undefined): PhaseView =>
  tier ? (RISK[tier] ?? { word: tier, dot: "grey" }) : { word: "—", dot: "grey" };

/** The review state as the catalog shows it: a published enterprise server is *Published*. */
export function reviewStatusView(s: {
  readonly reviewStatus: string;
  readonly published?: boolean | undefined;
  readonly scope: string;
}): PhaseView {
  switch (s.reviewStatus) {
    case "approved":
      return s.scope === "enterprise"
        ? s.published
          ? { word: "Published", dot: "green" }
          : { word: "Approved, not published", dot: "blue" }
        : { word: "Approved", dot: "green" };
    case "draft":
      return { word: "Draft", dot: "blue" };
    case "pending_review":
      return { word: "Pending review", dot: "amber" };
    case "rejected":
      return { word: "Rejected", dot: "red" };
    case "suspended":
      return { word: "Suspended", dot: "red" };
    default:
      return { word: s.reviewStatus, dot: "grey" };
  }
}

const AUTH: Record<string, string> = {
  none: "None",
  static: "Static API key",
  oauth_client: "OAuth client credentials",
  workload_federation: "Workload federation",
  oauth_user: "User-delegated OAuth",
  aws_sigv4: "AWS IAM (SigV4)",
};
export const mcpAuthWord = (k: string): string => AUTH[k] ?? k;

/** What each auth kind means, for the wizard's tiles (screen 48). */
export const AUTH_HINTS: Record<McpAuthKind, string> = {
  none: "For in-namespace servers; network policy is the guard.",
  static: "Value in Secrets Manager, at a gateway-only path. One per team by default.",
  oauth_client: "The gateway is a machine client; the access token's resource is this server.",
  workload_federation:
    "OIDC temporary credentials: the gateway exchanges its projected token (RFC 8693). Nothing stored.",
  oauth_user:
    "A service account in the SaaS is connected once; the gateway holds the refresh token. Never a named person.",
  aws_sigv4: "For AWS-hosted MCP servers, signed with the team gateway's role.",
};

const LOCATION: Record<string, string> = {
  external: "external",
  corporate: "corporate",
  in_namespace: "in namespace",
};
/** `Remote · Streamable HTTP`, `Remote · corporate`, `Hosted · stdio bridge` (screen 46). */
export function transportWord(transport: string, location: string): string {
  if (transport === "hosted") return "Hosted · stdio bridge";
  return location === "external" ? "Remote · Streamable HTTP" : `Remote · ${LOCATION[location]}`;
}

export const modeWord = (mode: string): string =>
  mode === "read_only" ? "Read-only" : mode === "full" ? "Full" : mode;

export const primitiveKindWord = (k: string): string =>
  k === "resource_template" ? "resource template" : k;

export const classificationWord = (c: string): string =>
  c ? `${c.charAt(0).toUpperCase()}${c.slice(1)}` : "—";

const CREDENTIAL: Record<string, PhaseView> = {
  set: { word: "Set", dot: "green" },
  missing: { word: "Credential required", dot: "amber" },
  expired: { word: "Reconnect needed", dot: "red" },
  not_required: { word: "Not required", dot: "grey" },
};
/** The credential state as metadata only (no screen ever shows a value). OAuth `set` reads *Connected*. */
export function mcpCredentialView(state: string | undefined, authKind?: string): PhaseView {
  if (state === "set" && (authKind === "oauth_user" || authKind === "oauth_client"))
    return { word: "Connected", dot: "green" };
  if (state === "not_required" && authKind === "workload_federation")
    return { word: "Ready", dot: "green" };
  return CREDENTIAL[state ?? ""] ?? { word: state ?? "—", dot: "grey" };
}

/** The annotation classes a primitive declares (`readOnlyHint`, `destructiveHint`, `openWorldHint`). */
export function annotationClasses(
  a: Readonly<Record<string, unknown>> | undefined,
): AnnotationClass[] {
  if (!a) return [];
  const out: AnnotationClass[] = [];
  if (a.readOnlyHint === true) out.push("read_only");
  if (a.destructiveHint === true) out.push("destructive");
  if (a.openWorldHint === true) out.push("open_world");
  return out;
}

export const ANNOTATION_WORDS: Record<AnnotationClass, string> = {
  read_only: "read-only",
  destructive: "destructive",
  open_world: "open-world",
};

const LEVEL_WORDS: Record<string, string> = {
  service: "service",
  team: "team",
  agent: "agent",
  pool: "pool",
};

/** A primitive's state in the inventory (screen 47): allowed, blocked at a level, or held for review. */
export function primitiveStatusView(p: {
  readonly status: string;
  readonly change?: string | null | undefined;
  readonly decision?: { readonly allowed: boolean; readonly level?: string | null } | undefined;
}): PhaseView {
  if (p.status === "pending_review")
    return p.change === "new" || p.change === undefined || p.change === null
      ? { word: "New · held", dot: "amber" }
      : { word: "Changed · held", dot: "amber" };
  if (p.status === "blocked" || p.decision?.allowed === false) {
    const lvl = p.decision?.level ? LEVEL_WORDS[p.decision.level] : undefined;
    return { word: lvl ? `Blocked (${lvl})` : "Blocked", dot: "red" };
  }
  return { word: "Allowed", dot: "green" };
}

/** An automatic check (screen 49): `pass`, `warn` (raises the tier) or `fail`. */
export const checkView = (outcome: string): PhaseView =>
  outcome === "pass"
    ? { word: "Passed", dot: "green" }
    : outcome === "warn"
      ? { word: "Elevated", dot: "amber" }
      : outcome === "fail"
        ? { word: "Failed", dot: "red" }
        : { word: outcome, dot: "grey" };

const CHECK_NAMES: Record<string, string> = {
  reachability: "Reachable",
  tls: "TLS valid",
  protocol_version: "Protocol version",
  host_policy: "Host not on the MCP host deny list",
  inventory: "Inventory of tools, resources and prompts",
  description_injection:
    "No instructions to the model, hidden Unicode or references to other tools",
  image_signature: "Image signed",
  image_digest: "Image pinned by digest",
  image_scan: "Image vulnerability scan",
};
export const checkName = (n: string): string => CHECK_NAMES[n] ?? n;

/** The team's switch for one server (screen 50). */
export function teamSwitchView(t: {
  readonly enabled: boolean;
  readonly state: string;
  readonly credential?: { readonly state: string } | null | undefined;
  readonly federationState?: string | null | undefined;
  readonly server: { readonly authKind: string; readonly reviewStatus: string };
}): PhaseView {
  if (t.server.reviewStatus === "suspended") return { word: "Suspended", dot: "red" };
  if (!t.enabled) return { word: "Not switched on", dot: "grey" };
  if (t.state === "pending") return { word: "Pending", dot: "blue" };
  if (t.server.authKind === "workload_federation")
    return t.federationState === "failed"
      ? { word: "Federation failing", dot: "red" }
      : t.federationState === "ok"
        ? { word: "Ready", dot: "green" }
        : { word: "Test the exchange", dot: "amber" };
  return mcpCredentialView(t.credential?.state ?? "not_required", t.server.authKind);
}

/** A switched-on server waits for the team's credential (MCP-US-3 AC-3.4). */
export function needsTeamCredential(t: {
  readonly credential?: { readonly state: string } | null | undefined;
  readonly server: { readonly authKind: string; readonly credentialMode?: string | undefined };
}): boolean {
  const k = t.server.authKind;
  if (k === "none" || k === "workload_federation" || k === "aws_sigv4") return false;
  if (t.server.credentialMode === "shared") return false;
  return t.credential?.state !== "set";
}

/** Whether the team connects the server by OAuth (*Connect* starts the flow) rather than pasting a value. */
export const usesOAuthConnect = (authKind: string): boolean => authKind === "oauth_user";

/** Whether a value is pasted (static key or an OAuth client secret). */
export const usesSecretValue = (authKind: string): boolean =>
  authKind === "static" || authKind === "oauth_client";

// ---------------------------------------------------------------------------------------------------------------
// Refusal and error reasons (gateway contract §13.4, API contract §4.14)

const REASONS: Record<string, string> = {
  server_not_published: "Server not published",
  server_suspended: "Server suspended",
  server_not_enabled_for_team: "Not switched on for the team",
  server_not_enabled_for_agent: "Not selected for the agent",
  primitive_blocked_service: "Blocked by service policy",
  primitive_blocked_team: "Blocked by team policy",
  primitive_blocked_agent: "Blocked for the agent",
  primitive_pending_review: "Held for review",
  rate_limited: "Rate limited",
  auth_reconnect_needed: "Reconnect needed",
  federation_not_ready: "Federation not ready",
  header_mismatch: "Header mismatch",
  team_servers_not_allowed: "Requires service admin permission for this team",
  approval_not_permitted_by_policy:
    "The approval policy needs a security operator or service admin",
  team_gateway_required: "Needs the team's own gateway",
  governed_by_mcp_server: "Governed by an MCP server",
};
export const mcpReasonWord = (r: string | null | undefined): string =>
  r ? (REASONS[r] ?? r) : "—";

/** MCP-US-4 AC-4.1: the disabled *Register team server* button's tooltip. */
export const TEAM_SERVERS_NOT_ALLOWED = "Requires service admin permission for this team";
/** A team switches on its first server only with its own gateway (contract CD-44). */
export const TEAM_GATEWAY_REQUIRED =
  "Needs the team's own gateway (ask a service admin to deploy it in the team's namespace)";

// ---------------------------------------------------------------------------------------------------------------
// Approval policy (PRD §8, MCP-OQ-4)

export const APPROVAL_POLICIES: readonly {
  readonly value: ApprovalPolicy;
  readonly label: string;
  readonly consequence: string;
}[] = [
  {
    value: "team_all",
    label: "Team-admins approve every tier (default)",
    consequence:
      "Team-admins approve their own team servers of any risk tier. Every approval is audited and visible to security operators.",
  },
  {
    value: "team_low_security_higher",
    label: "Team approves low, security approves higher",
    consequence:
      "Team-admins approve low-risk servers; elevated and high need a security operator or service admin.",
  },
  {
    value: "security_all",
    label: "Security approves every team server",
    consequence:
      "Only a security operator or service admin approves team servers, whatever the tier.",
  },
];

/** Who approves a team server of `tier` under `policy` (TC-16): `team_admin` or `security`. */
export function approverFor(
  policy: string,
  tier: string | null | undefined,
): "team_admin" | "security" {
  if (policy === "security_all") return "security";
  if (policy === "team_low_security_higher") return tier === "low" ? "team_admin" : "security";
  return "team_admin";
}

/** Why a team-admin may not approve a team server, or undefined when they may (the API decides). */
export function teamApproveBlock(server: {
  readonly approver?: string | null | undefined;
  readonly reviewStatus: string;
}): string | undefined {
  if (server.reviewStatus !== "pending_review") return "Submit the server for review first";
  if (server.approver === "security")
    return "Needs a security operator or service admin (approval policy)";
  return undefined;
}

/** The sentence that explains the approver of a team server (screens 49, 51). */
export function approvalSentence(policy: string, tier: string | null | undefined): string {
  const who = approverFor(policy, tier);
  const t = riskView(tier).word.toLowerCase();
  return who === "team_admin"
    ? `Risk tier ${t}: the team-admin can approve it. The approval is audited and visible to security operators.`
    : `Risk tier ${t}: it needs a security operator or service admin under the service approval policy.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Add and register forms (screens 48, 51)

export interface McpServerDraft {
  readonly slug: string;
  readonly displayName: string;
  readonly owner: string;
  readonly purpose: string;
  readonly docUrl: string;
  readonly dataClassification: DataClassification;
  readonly transport: McpTransport;
  readonly location: McpLocation;
  readonly url: string;
  readonly imageDigest: string;
  readonly authKind: McpAuthKind;
  readonly authHeader: string;
  readonly credentialMode: "shared" | "per_team";
  readonly audience: string;
  readonly issuer: string;
  readonly tokenEndpoint: string;
  readonly driftPolicy: "hold" | "auto_approve_compatible";
  readonly trustAnnotations: boolean;
  readonly defaultForNewTeams: boolean;
}

export const emptyMcpDraft = (scope: McpScope): McpServerDraft => ({
  slug: "",
  displayName: "",
  owner: "",
  purpose: "",
  docUrl: "",
  dataClassification: "internal",
  transport: "streamable_http",
  location: scope === "team" ? "corporate" : "external",
  url: "",
  imageDigest: "",
  authKind: scope === "team" ? "none" : "oauth_client",
  authHeader: "",
  credentialMode: "per_team",
  audience: "",
  issuer: "",
  tokenEndpoint: "",
  driftPolicy: "hold",
  trustAnnotations: false,
  defaultForNewTeams: false,
});

export type McpDraftErrors = Partial<Record<keyof McpServerDraft, string>>;

/** The steps of the service wizard (screen 48) and the team wizard (screen 51). */
export const SERVICE_MCP_STEPS = [
  "Server details",
  "Connection and authentication",
  "Inventory and policy",
  "Availability to teams",
  "Review and create",
] as const;
export const TEAM_MCP_STEPS = [
  "Purpose and owner",
  "Connection and authentication",
  "Inventory",
  "Review and submit",
] as const;

/** The fields each wizard step checks, so *Next* stops at the first step with an error. */
export const STEP_FIELDS: Readonly<Record<string, readonly (keyof McpServerDraft)[]>> = {
  "Server details": ["slug", "displayName", "owner", "purpose", "docUrl"],
  "Purpose and owner": ["slug", "displayName", "owner", "purpose", "docUrl"],
  "Connection and authentication": [
    "authKind",
    "url",
    "imageDigest",
    "authHeader",
    "audience",
    "issuer",
    "tokenEndpoint",
  ],
};

/** Client checks of screens 48 and 51 (the API repeats them and names `details.reason`). */
export function validateMcpServer(
  d: McpServerDraft,
  scope: McpScope,
  taken: readonly string[] = [],
): McpDraftErrors {
  const e: McpDraftErrors = {};
  if (d.slug === RESERVED_MCP_SLUG) e.slug = "afs is reserved for the aggregated endpoint";
  else if (!SLUG.test(d.slug))
    e.slug = "Use 2 to 31 lowercase letters, digits and hyphens, starting with a letter";
  else if (taken.includes(d.slug)) e.slug = "This slug is already used by another server";
  if (!d.displayName.trim()) e.displayName = "Enter a display name";
  if (scope === "team") {
    if (!d.owner.trim()) e.owner = "Enter the owner";
    if (!d.purpose.trim()) e.purpose = "Enter the purpose";
  }
  if (d.docUrl.trim() && !/^https:\/\//.test(d.docUrl.trim()))
    e.docUrl = "Enter an https:// documentation link";
  if (d.transport === "streamable_http") {
    if (!d.url.trim()) e.url = "Enter the server URL";
    else if (d.location !== "in_namespace" && !d.url.startsWith("https://"))
      e.url = "External and corporate servers need an https:// URL";
    else if (!/^https?:\/\//.test(d.url))
      e.url = "Enter a URL, for example http://ledger-mcp:8080/mcp";
  } else if (!/@sha256:[0-9a-f]{64}$/.test(d.imageDigest.trim()))
    e.imageDigest = "Pin the image by digest: <registry>/<image>@sha256:<64 hex>";
  if (d.authKind === "static" && d.authHeader.trim() && !/^[A-Za-z0-9-]+$/.test(d.authHeader))
    e.authHeader = "Enter a header name, for example X-Api-Key";
  if (d.authKind === "workload_federation") {
    if (!d.audience.trim()) e.audience = "Enter the audience the target IdP expects";
    if (!d.issuer.trim()) e.issuer = "Enter the issuer the server trusts";
    if (!/^https:\/\//.test(d.tokenEndpoint.trim()))
      e.tokenEndpoint = "Enter the https:// token endpoint";
  }
  if (d.authKind === "aws_sigv4" && d.transport === "hosted")
    e.authKind = "AWS IAM signing is for remote AWS-hosted servers";
  return e;
}

/** The errors of one wizard step. */
export function stepErrors(step: string, all: McpDraftErrors): McpDraftErrors {
  const keys = STEP_FIELDS[step] ?? [];
  return Object.fromEntries(Object.entries(all).filter(([k]) => keys.includes(k as never)));
}

function common(d: McpServerDraft) {
  return {
    slug: d.slug,
    displayName: d.displayName.trim(),
    ...(d.owner.trim() && { owner: d.owner.trim() }),
    ...(d.purpose.trim() && { purpose: d.purpose.trim() }),
    ...(d.docUrl.trim() && { docUrl: d.docUrl.trim() }),
    dataClassification: d.dataClassification,
    transport: d.transport,
    location: d.transport === "hosted" ? ("in_namespace" as const) : d.location,
    ...(d.transport === "streamable_http"
      ? { url: d.url.trim() }
      : { hosted: { imageDigest: d.imageDigest.trim() } }),
    authKind: d.authKind,
    ...(d.authKind === "static" && d.authHeader.trim() && { authHeader: d.authHeader.trim() }),
    ...(d.authKind === "workload_federation" && {
      federation: {
        audience: d.audience.trim(),
        issuer: d.issuer.trim(),
        tokenEndpoint: d.tokenEndpoint.trim(),
      },
    }),
  };
}

/** `CreateMcpServer` (enterprise, created as a draft). */
export const toCreateMcpServerBody = (d: McpServerDraft) => ({
  ...common(d),
  ...(usesSecretValue(d.authKind) || d.authKind === "oauth_user"
    ? { credentialMode: d.credentialMode }
    : {}),
  driftPolicy: d.driftPolicy,
  trustAnnotations: d.trustAnnotations,
});

/** `CreateTeamMcpServer` (team server, created as a draft; owner and purpose required). */
export const toCreateTeamMcpServerBody = (d: McpServerDraft) => ({
  ...common(d),
  owner: d.owner.trim(),
  purpose: d.purpose.trim(),
});

/** A server.json import (screen 48 *Import server.json*): JSON object or an error message. */
export function parseManifest(
  text: string,
): { manifest: Record<string, unknown> } | { error: string } {
  if (!text.trim()) return { error: "Paste a server.json" };
  try {
    const v: unknown = JSON.parse(text);
    if (typeof v !== "object" || v === null || Array.isArray(v))
      return { error: "A server.json is a JSON object" };
    return { manifest: v as Record<string, unknown> };
  } catch {
    return { error: "This is not valid JSON" };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Policy rules (PRD §7.3)

export interface PolicyRuleDraft {
  readonly effect: "allow" | "block";
  /** `name` or `class`: exactly one is used. */
  readonly by: "name" | "class";
  readonly name: string;
  readonly class: AnnotationClass;
  /** Calls per minute per agent; empty for none. */
  readonly rateLimitPerMinute: string;
}

export const emptyRule = (): PolicyRuleDraft => ({
  effect: "block",
  by: "name",
  name: "",
  class: "destructive",
  rateLimitPerMinute: "",
});

/** One rule's error, or undefined (the API answers `invalid_policy_rule` for the same cases). */
export function ruleError(r: PolicyRuleDraft): string | undefined {
  if (r.by === "name" && !/^[^\s]{1,200}$/.test(r.name.trim()))
    return "Enter a primitive name or a glob such as delete_*";
  if (r.rateLimitPerMinute !== "" && !/^[1-9]\d{0,4}$/.test(r.rateLimitPerMinute))
    return "Enter calls per minute as a whole number";
  if (r.effect === "block" && r.rateLimitPerMinute !== "")
    return "A rate limit applies to allowed primitives";
  return undefined;
}

/** The rules as `PutMcpPolicy` / `PutTeamMcpPolicy` take them. */
export const toRules = (rules: readonly PolicyRuleDraft[]) =>
  rules.map((r) => ({
    effect: r.effect,
    ...(r.by === "name" ? { name: r.name.trim() } : { class: r.class }),
    ...(r.rateLimitPerMinute !== "" && { rateLimitPerMinute: Number(r.rateLimitPerMinute) }),
  }));

/** A rule as one line: `Block delete_*`, `Block annotation: destructive`, `Rate limit add_comment 30 / min`. */
export function ruleWord(r: {
  readonly effect: string;
  readonly name?: string | undefined;
  readonly class?: string | undefined;
  readonly rateLimitPerMinute?: number | null | undefined;
}): string {
  const what = r.name ?? `annotation: ${ANNOTATION_WORDS[r.class as AnnotationClass] ?? r.class}`;
  if (r.effect === "allow" && r.rateLimitPerMinute)
    return `Rate limit ${what} · ${r.rateLimitPerMinute} / min per agent`;
  return `${r.effect === "block" ? "Block" : "Allow"} ${what}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Agent MCP settings and environment (screen 52, gateway contract §13.5)

export interface AgentMcpBlock {
  readonly serverId: string;
  readonly name: string;
}

export interface AgentMcpSpec {
  readonly access: "all" | "selected";
  readonly serverIds: readonly string[];
  readonly mode: AgentMcpMode;
  readonly blocks: readonly AgentMcpBlock[];
}

export interface McpServerChoice {
  readonly id: string;
  readonly slug: string;
}

/** The servers the agent reaches: the team's switched-on set, or the selected ones of it. */
export function effectiveMcpServers(
  spec: AgentMcpSpec,
  team: readonly McpServerChoice[],
): McpServerChoice[] {
  const on = spec.access === "all" ? team : team.filter((s) => spec.serverIds.includes(s.id));
  return [...on].sort((a, b) => a.slug.localeCompare(b.slug));
}

export interface AgentMcpErrors {
  readonly serverIds?: string;
  readonly blocks?: string;
}

/** Client checks of screen 52 (the API answers `mcp_server_not_enabled_for_team` for a server not on). */
export function validateAgentMcp(
  spec: AgentMcpSpec,
  team: readonly McpServerChoice[],
): AgentMcpErrors {
  const ids = new Set(team.map((s) => s.id));
  const e: { serverIds?: string; blocks?: string } = {};
  if (spec.access === "selected" && spec.serverIds.some((id) => !ids.has(id)))
    e.serverIds = "A selected server is not switched on for the team";
  if (spec.blocks.some((b) => !b.name.trim())) e.blocks = "Enter the tool name to block";
  return e;
}

/** `mcp` of `UpdateAgent`: the selection only for `selected`, blocks as rules. */
export const toAgentMcpBody = (spec: AgentMcpSpec) => ({
  access: spec.access,
  ...(spec.access === "selected" ? { serverIds: [...spec.serverIds] } : {}),
  mode: spec.mode,
  blocks: spec.blocks.map((b) => ({ serverId: b.serverId, name: b.name.trim(), effect: "block" })),
});

/** `AFS_MCP_<SLUG>_URL` (gateway contract §13.5). */
export const mcpServerUrlEnv = (slug: string): string =>
  `AFS_MCP_${slug.toUpperCase().replace(/-/g, "_")}_URL`;

export const MCP_CONFIG_FILE = "/etc/afs/mcp.json";

/**
 * What the agent receives for its MCP settings (gateway contract §13.5): the aggregated URL, the mode, the sorted
 * server list and one URL per server, nothing at all when it has no effective server. Never a credential.
 */
export function mcpEnvPreview(
  spec: AgentMcpSpec,
  team: readonly McpServerChoice[],
  gatewayUrl?: string | null,
): EnvLine[] {
  const servers = effectiveMcpServers(spec, team);
  if (servers.length === 0) return [];
  const base = gatewayUrl ?? `\${AFS_GATEWAY_URL}`;
  return [
    { name: "AFS_MCP_URL", value: `${base}/mcp` },
    { name: "AFS_MCP_MODE", value: spec.mode },
    { name: "AFS_MCP_SERVERS", value: servers.map((s) => s.slug).join(",") },
    ...servers.map((s) => ({ name: mcpServerUrlEnv(s.slug), value: `${base}/mcp/${s.slug}` })),
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Usage report (screens 53, 55)

export const TEAM_USAGE_VIEWS = [
  { id: "usage", label: "Usage" },
  { id: "unused", label: "Enabled but unused" },
  { id: "refusals", label: "Refusals" },
  { id: "discovery", label: "Discovery" },
] as const;
export const SERVICE_USAGE_VIEWS = [
  ...TEAM_USAGE_VIEWS,
  { id: "adoption", label: "Adoption" },
] as const;

/** `1.1%` from errors and calls; `—` without calls. */
export const pct = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : "—";

/** `820 ms` or `1.4 s`; `—` when absent. */
export const ms = (v: number | null | undefined): string =>
  v === null || v === undefined ? "—" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${v} ms`;

/** `41 days ago`, `Today`, `Never`, from an ISO time and now. */
export function lastUsedWord(at: string | null | undefined, now: number): string {
  if (!at) return "Never";
  const days = Math.floor((now - Date.parse(at)) / 86_400_000);
  if (Number.isNaN(days)) return "—";
  return days <= 0 ? "Today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

// ---------------------------------------------------------------------------------------------------------------
// Federated identities (PRD Appendix C)

const FED_NAME = /^[a-z][a-z0-9-]{0,30}$/;

/** `AFS_FEDERATED_TOKEN_FILE_<NAME>` and the token file path for an identity name. */
export const federatedEnvVar = (name: string): string =>
  `AFS_FEDERATED_TOKEN_FILE_${name.toUpperCase().replace(/-/g, "_")}`;
export const federatedFilePath = (name: string): string =>
  `/var/run/secrets/afs/federation/${name}/token`;

export interface FederatedIdentityDraft {
  readonly name: string;
  readonly audience: string;
  readonly expirationSeconds: string;
}

/** Client checks of a federated identity (the API also checks `federation.allowed_audiences`). */
export function validateFederatedIdentity(
  d: FederatedIdentityDraft,
  existing: readonly string[],
): Partial<Record<keyof FederatedIdentityDraft, string>> {
  const e: Partial<Record<keyof FederatedIdentityDraft, string>> = {};
  if (!FED_NAME.test(d.name))
    e.name = "Use lowercase letters, digits and hyphens, starting with a letter";
  else if (existing.includes(d.name)) e.name = "This name is already used";
  else if (existing.length >= 10) e.name = "At most 10 federated identities per agent";
  const aud = d.audience.trim();
  if (!aud) e.audience = "Enter the audience";
  else if (aud === "sts.amazonaws.com") e.audience = "AWS access goes through Pod Identity";
  else if (aud === "afs-gateway") e.audience = "afs-gateway is reserved";
  const s = Number(d.expirationSeconds);
  if (!Number.isInteger(s) || s < 600 || s > 86_400)
    e.expirationSeconds = "Enter 600 to 86400 seconds";
  return e;
}

// ---------------------------------------------------------------------------------------------------------------
// CLI previews (WEB-6)

const cli = (op: string, values: Readonly<Record<string, CliValue>>): CliCommand =>
  withBoolFlags(buildCli(op, values));

export const createMcpServerCli = (d: McpServerDraft): CliCommand =>
  cli("CreateMcpServer", toCreateMcpServerBody(d));

export const createTeamMcpServerCli = (teamId: string, d: McpServerDraft): CliCommand =>
  cli("CreateTeamMcpServer", { teamId, ...toCreateTeamMcpServerBody(d) });

/** `--manifest file://server.json`: the CLI reads the file (the form's JSON is not repeated on the line). */
export function importMcpServerManifestCli(slug?: string): CliCommand {
  const cmd = cli("ImportMcpServerManifest", { manifest: {}, ...(slug ? { slug } : {}) });
  return {
    ...cmd,
    args: cmd.args.map(([f, v]) => (f === "manifest" ? [f, "file://server.json"] : [f, v])),
  };
}

export const publishMcpServerCli = (mcpServerId: string): CliCommand =>
  cli("PublishMcpServer", { mcpServerId });

export const submitMcpServerCli = (teamId: string, mcpServerId: string): CliCommand =>
  cli("SubmitMcpServerForReview", { teamId, mcpServerId });

export type ReviewDecision = "approve" | "reject" | "request-changes";

/** The review decision commands (screen 49): service path, or the team path for team approval. */
export function reviewCli(
  decision: ReviewDecision,
  mcpServerId: string,
  note: string,
  primitives: readonly { primitiveId: string; decision: string }[] = [],
  teamId?: string,
): CliCommand {
  const p = primitives.length > 0 ? { primitives: [...primitives] } : {};
  if (teamId && decision !== "request-changes")
    return cli(decision === "approve" ? "ApproveTeamMcpServer" : "RejectTeamMcpServer", {
      teamId,
      mcpServerId,
      note,
      ...p,
    });
  const op =
    decision === "approve"
      ? "ApproveMcpServer"
      : decision === "reject"
        ? "RejectMcpServer"
        : "RequestMcpServerChanges";
  return cli(op, { mcpServerId, note, ...p });
}

export const suspendMcpServerCli = (mcpServerId: string, suspend: boolean, reason: string) =>
  cli(suspend ? "SuspendMcpServer" : "ResumeMcpServer", { mcpServerId, reason });

export const putMcpPolicyCli = (mcpServerId: string, rules: readonly PolicyRuleDraft[]) =>
  cli("PutMcpPolicy", { mcpServerId, rules: toRules(rules) });

export const putTeamMcpPolicyCli = (
  teamId: string,
  mcpServerId: string,
  rules: readonly PolicyRuleDraft[],
) => cli("PutTeamMcpPolicy", { teamId, mcpServerId, rules: toRules(rules) });

/** A credential command: the value is a `file://<path>` placeholder, never read. */
export const putMcpServerCredentialCli = (mcpServerId: string, scope: string, authKind: string) =>
  cli(
    "PutMcpServerCredential",
    authKind === "oauth_client"
      ? { mcpServerId, scope, clientId: "<client id>", clientSecret: "" }
      : { mcpServerId, scope, value: "" },
  );

export const putTeamMcpServerCredentialCli = (
  teamId: string,
  mcpServerId: string,
  authKind: string,
) =>
  cli(
    "PutTeamMcpServerCredential",
    authKind === "oauth_client"
      ? { teamId, mcpServerId, clientId: "<client id>", clientSecret: "" }
      : { teamId, mcpServerId, value: "" },
  );

export const putTeamMcpServerCli = (
  teamId: string,
  mcpServerId: string,
  enabled: boolean,
  mode: string,
) => cli("PutTeamMcpServer", { teamId, mcpServerId, enabled, ...(enabled ? { mode } : {}) });

export const startMcpOAuthCli = (teamId: string, mcpServerId: string) =>
  cli("StartMcpOAuthConnect", { teamId, mcpServerId });

export const testMcpFederationCli = (teamId: string, mcpServerId: string) =>
  cli("TestMcpFederation", { teamId, mcpServerId });

/** The agent's MCP settings as `afs agents update-agent --mcp '<json>'` (there is no PutAgentMcp operation). */
export const updateAgentMcpCli = (teamId: string, agentId: string, spec: AgentMcpSpec) =>
  cli("UpdateAgent", { teamId, agentId, mcp: toAgentMcpBody(spec) });

export const startQueryCaptureCli = (days: number, reason: string) =>
  cli("StartMcpQueryCapture", { days, reason });

export const putFederatedIdentityCli = (
  teamId: string,
  agentId: string,
  d: FederatedIdentityDraft,
) =>
  cli("PutAgentFederatedIdentity", {
    teamId,
    agentId,
    name: d.name,
    audience: d.audience.trim(),
    ...(d.expirationSeconds && { expirationSeconds: Number(d.expirationSeconds) }),
  });

export const putSettingCli = (key: string, value: CliValue) => cli("PutSetting", { key, value });
