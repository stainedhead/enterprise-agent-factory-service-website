// Pure collaboration rules (Paperclip change, PRD §6.1): reason texts, the Open Paperclip precedence, state
// words, the managed-secret filter and the per-person aggregation of report rows. No React, no SDK.
import type { Dot, PhaseView } from "./status.js";

/** Text for `effective.reasons[]` and the matching `ValidationError` field reasons (WEB-US-44). */
const REASON_TEXT: Record<string, string> = {
  team_not_allowed: "Not allowed for this team by the service",
  collaboration_not_allowed_for_team: "Not allowed for this team by the service",
  service_endpoints_off: "Public collaboration is off for the service",
  collab_public_endpoints_off: "Public collaboration is off for the service",
  base_domain_unset: "Public collaboration is not configured for the service",
  collab_base_domain_unset: "Public collaboration is not configured for the service",
  provider_without_collab_client:
    "Your sign-in provider has no collaboration client; ask a service admin",
};

/** The text of a reason; an unknown reason is shown as its raw string, never an error. */
export const reasonText = (reason: string): string => REASON_TEXT[reason] ?? reason;

/** *On* (green) or *Off* (hollow grey): what the edge honours, not what was chosen. */
export const surfaceView = (on: boolean): PhaseView =>
  on ? { word: "On", dot: "green" } : { word: "Off", dot: "grey" };

const LINK: Record<string, PhaseView> = {
  linked: { word: "linked", dot: "green" },
  pending: { word: "pending", dot: "amber" },
  failed: { word: "failed", dot: "red" },
  disabled: { word: "disabled", dot: "grey" },
};
/** A link state is a dot plus the contract's word; an unknown state passes through with a grey dot. */
export const linkStateView = (state: string): PhaseView =>
  LINK[state] ?? { word: state, dot: "grey" };

/** A worker that is not connected reads *Not connected* in the agents list. */
export const NOT_CONNECTED: PhaseView = { word: "Not connected", dot: "grey" };

export interface ConditionLike {
  readonly type: string;
  readonly status: string;
  readonly reason?: string | undefined;
  readonly message?: string | undefined;
}

/** `UnmanagedPaperclipAgents` is inverted: `False` is healthy. `Unknown` is amber. */
export function conditionView(c: ConditionLike): { word: string; dot: Dot } {
  const word = c.status === "True" || c.status === "False" ? c.status : "Unknown";
  if (word === "Unknown") return { word, dot: "amber" };
  const inverted = c.type === "UnmanagedPaperclipAgents";
  const healthy = inverted ? word === "False" : word === "True";
  return { word, dot: healthy ? "green" : "red" };
}

export const CONDITION_TYPES = [
  "EndpointReady",
  "PaperclipReady",
  "RegistrationHealthy",
  "UnmanagedPaperclipAgents",
] as const;

export interface OpenPaperclipInput {
  readonly hostname: string | null;
  readonly effectiveWebUi: boolean;
  readonly reasons: readonly string[];
  readonly teamState?: string | undefined;
  readonly phase: string;
  readonly canAccess: boolean;
}

/**
 * Whether *Open Paperclip* is enabled, and if not why. The precedence is fixed (WEB-US-44): no hostname,
 * the web UI not effective (the first reason's text), a suspended team, a phase that is not Ready; the
 * caller needs `collaboration:access` first of all.
 */
export function openPaperclipState(i: OpenPaperclipInput): { enabled: boolean; reason?: string } {
  if (!i.canAccess) return { enabled: false, reason: "Requires team-viewer" };
  if (i.hostname === null)
    return { enabled: false, reason: "Public collaboration is not configured for the service" };
  if (!i.effectiveWebUi) {
    const first = i.reasons.find((r) => r !== "provider_without_collab_client") ?? i.reasons[0];
    return {
      enabled: false,
      reason: first ? reasonText(first) : "The web UI is off. A team-admin can turn it on.",
    };
  }
  if (i.teamState === "suspended") return { enabled: false, reason: "Team is suspended" };
  if (i.phase !== "Ready")
    return { enabled: false, reason: `The collaboration agent is ${i.phase}` };
  return { enabled: true };
}

export type Surface = "webUi" | "restApi";

export interface SurfaceInput {
  readonly stored: boolean;
  readonly effective: boolean;
  readonly reasons: readonly string[];
}

/**
 * The switch of one surface (WP-D3): a stored-off surface that is blocked is disabled with the reason; a
 * stored-on surface that is not effective stays enabled (turning off is always accepted) and the card says
 * why the edge is not serving it. The state word follows the edge.
 */
export function surfaceSwitch(s: SurfaceInput): {
  state: PhaseView;
  disabledReason?: string;
  notServing?: string;
} {
  const state = surfaceView(s.effective);
  if (s.effective) return { state };
  const why = s.reasons[0] ? reasonText(s.reasons[0]) : undefined;
  if (s.stored) return { state, ...(why ? { notServing: why } : {}) };
  return { state, ...(why ? { disabledReason: why } : {}) };
}

export interface SecretLike {
  readonly managedBy?: string | undefined;
  readonly agentId?: string | undefined;
}

/** The secrets of the collaboration agent that AFS or Paperclip manage (WP-D7). */
export const isCollaborationManaged = (s: SecretLike, collaborationAgentId: string): boolean =>
  (s.managedBy === "afs" || s.managedBy === "paperclip") && s.agentId === collaborationAgentId;

export const managedByLabel = (managedBy: string | undefined): string =>
  managedBy === "afs"
    ? "Managed by AFS"
    : managedBy === "paperclip"
      ? "Managed by Paperclip"
      : managedBy && managedBy !== "user"
        ? managedBy
        : "Team";

export interface AccessRow {
  readonly principal?:
    | {
        readonly id: string;
        readonly type?: string | undefined;
        readonly name?: string | undefined;
      }
    | undefined;
  readonly signIns?: number | undefined;
  readonly requests?: number | undefined;
  readonly deniedRequests?: number | undefined;
  readonly serviceAdminEntry?: boolean | undefined;
}

export interface PersonAccess {
  readonly id: string;
  readonly label: string;
  readonly signIns: number;
  readonly requests: number;
  readonly deniedRequests: number;
  readonly serviceAdminEntry: boolean;
}

/** Sums the day rows per person, sorts by requests descending and keeps the top `limit` (WEB-US-49). */
export function aggregatePeople(rows: readonly AccessRow[], limit = 10): PersonAccess[] {
  const by = new Map<string, PersonAccess>();
  for (const r of rows) {
    if (!r.principal) continue;
    const p = r.principal;
    const label = (p.name ?? p.id) + (p.type === "api_key" ? " (API key)" : "");
    const cur = by.get(p.id);
    by.set(p.id, {
      id: p.id,
      label,
      signIns: (cur?.signIns ?? 0) + (r.signIns ?? 0),
      requests: (cur?.requests ?? 0) + (r.requests ?? 0),
      deniedRequests: (cur?.deniedRequests ?? 0) + (r.deniedRequests ?? 0),
      serviceAdminEntry: (cur?.serviceAdminEntry ?? false) || r.serviceAdminEntry === true,
    });
  }
  return [...by.values()].sort((a, b) => b.requests - a.requests).slice(0, limit);
}

/** Names reserved for Paperclip: `paperclip` and `paperclip-*`, except the worker key (WEB-US-54). */
export function reservedSecretName(name: string, scope: string): boolean {
  if (name === "paperclip-agent-api-key" && scope === "agent") return false;
  return name === "paperclip" || name.startsWith("paperclip-");
}
export const RESERVED_NAME_TEXT = "This name is reserved for Paperclip";

/** The names the *Rotate Paperclip keys* dialog lists (WEB-US-50). */
export const ROTATABLE_KEYS = [
  "paperclip-better-auth-secret",
  "paperclip-tool-action-signing-secret",
] as const;
export const MASTER_KEY = "paperclip-secrets-master-key";
export const MASTER_KEY_TEXT =
  "Cannot be rotated: Paperclip could no longer decrypt its stored identities";

/** A team id shortened for the CLI panel: 12 characters and an ellipsis (WP-D16). */
export const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 12)}…` : id);

/** The text for the API's managed-secret refusals when a request is forced (WEB-US-54); `undefined` for any other reason. */
export function managedRefusalText(
  reason: string | undefined,
  managedBy?: string,
): string | undefined {
  if (reason === "managed_secret")
    return `This secret is managed by ${managedBy === "paperclip" ? "Paperclip" : "AFS"} and cannot be changed here`;
  if (reason === "master_key_not_rotatable") return MASTER_KEY_TEXT;
  return undefined;
}

/** The seven service settings of the Collaboration tab, in the order shown (WEB-US-57). */
export const COLLAB_SETTING_KEYS = [
  "collab.base_domain",
  "collab.public_endpoints",
  "collab.allowed_source_cidrs",
  "collab.session_ttl_minutes",
  "collab.content_scan",
  "collab.max_body_mb",
  "collab.denied_spike_threshold",
] as const;

export const isCollabSetting = (key: string): boolean => key.startsWith("collab.");

/**
 * The confirmation a change of a `collab.*` setting needs, or `undefined` when none. `current` and `next` are
 * the field texts (the base domain empty means unset, the CIDR text is one range per line).
 */
export function collabConfirmation(key: string, current: string, next: string): string | undefined {
  if (current === next) return undefined;
  if (key === "collab.base_domain") return "Every team's Paperclip address changes.";
  if (key === "collab.public_endpoints" && next === "false")
    return "Every team's public endpoint stops within a minute. Teams' choices are kept.";
  if (key === "collab.content_scan" && next === "off")
    return "Credentials typed into Paperclip will no longer be blocked or detected.";
  if (key === "collab.allowed_source_cidrs" && next.trim() !== "")
    return "Requests from outside these ranges are blocked by the firewall.";
  return undefined;
}

/** The text of a setting for its field: CIDRs one per line, everything else as `settingText` does. */
export function collabFieldText(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.join(key === "collab.allowed_source_cidrs" ? "\n" : ", ");
  return value === null || value === undefined ? "" : String(value);
}

/** CIDR lines to the comma list the settings use case parses; blank lines are dropped. */
export const cidrLinesToList = (text: string): string =>
  text
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ");

const CIDR = /^([0-9]{1,3}(\.[0-9]{1,3}){3}|[0-9a-fA-F:]+:[0-9a-fA-F:]*)\/[0-9]{1,3}$/;
/** The CIDRs that are not IPv4 or IPv6 ranges (empty when every line is one). */
export const badCidrs = (text: string): string[] =>
  cidrLinesToList(text)
    .split(", ")
    .filter((l) => l !== "" && !CIDR.test(l));

/** A URL the console may link to: `https:` or `http:` only, else `null` (never `javascript:` or `data:`). */
export function safeWebUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const p = new URL(url).protocol;
    return p === "https:" || p === "http:" ? url : null;
  } catch {
    return null;
  }
}
