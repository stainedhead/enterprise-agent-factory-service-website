// Pure orchestration rules (team orchestration agent change, PRD section 5 and 6): the tools and their
// capability profile, exposure levels and the limit, the reasons a surface is lowered, the *Open <tool>*
// precedence and the `afs` commands of every orchestration form. No React, no SDK. The harness is never named
// here: team screens say "Orchestration runtime" (ORC-6).
import { boolFlag, buildCli, type CliCommand } from "./cli.js";
import type { PhaseView } from "./status.js";

/** The fixed name of every team's orchestration agent (ORC-3); no other agent may take it. */
export const ORCHESTRATOR_NAME = "orchestrator";
/** What team screens call the runtime of the orchestration agent (ORC-6). */
export const RUNTIME_TEXT = "Orchestration runtime";

export const TOOLS = ["paperclip", "buzz"] as const;
export type Tool = (typeof TOOLS)[number];

export interface ToolInfo {
  readonly label: string;
  /** The one-letter mark of the tool tile. */
  readonly mark: string;
  readonly preview: boolean;
  readonly webUi: boolean;
  readonly webApi: boolean;
  readonly port: number;
  readonly blurb: string;
}

const TOOL_INFO: Record<Tool, ToolInfo> = {
  paperclip: {
    label: "Paperclip AI",
    mark: "P",
    preview: false,
    webUi: true,
    webApi: true,
    port: 3100,
    blurb: "Board, chat and agent groupings. Agents pull work from it and report progress.",
  },
  buzz: {
    label: "Buzz",
    mark: "B",
    preview: true,
    webUi: false,
    webApi: false,
    port: 3000,
    blurb: "Relay-based chat between people and agents. No browser client and no REST API yet.",
  },
};

/** A tool the console does not know passes through with its raw name. */
export const toolInfo = (tool: string): ToolInfo =>
  (TOOL_INFO as Record<string, ToolInfo | undefined>)[tool] ?? {
    label: tool,
    mark: tool.slice(0, 1).toUpperCase(),
    preview: false,
    webUi: false,
    webApi: false,
    port: 0,
    blurb: "",
  };
export const toolLabel = (tool: string): string => toolInfo(tool).label;

export const EXPOSURES = ["off", "private", "public"] as const;
export type Exposure = (typeof EXPOSURES)[number];
export const EXPOSURE_LABEL: Record<Exposure, string> = {
  off: "Off",
  private: "Private",
  public: "Public",
};
export const isExposure = (v: string): v is Exposure =>
  (EXPOSURES as readonly string[]).includes(v);
export const exposureLabel = (v: string): string => (isExposure(v) ? EXPOSURE_LABEL[v] : v);
const rank = (e: string): number => EXPOSURES.indexOf(e as Exposure);
export const aboveLimit = (level: string, limit: string): boolean => rank(level) > rank(limit);

export type Surface = "webUi" | "webApi";
export const SURFACE_LABEL: Record<Surface, string> = { webUi: "Web UI", webApi: "Web API" };
export const SURFACE_TEXT: Record<Surface, string> = {
  webUi: "The tool in a browser. Viewers read; collaborators and team-admins write.",
  webApi:
    "The tool's REST API for pipelines. AFS token in X-Afs-Authorization; the tool's key in Authorization.",
};

/** The N/A text of a surface the tool does not have (ORC-15, OR-D7). */
export function notApplicableText(tool: string, surface: Surface): string {
  const t = toolLabel(tool);
  return surface === "webUi"
    ? `N/A for ${t}. ${t} has no browser client, so the Web UI stays off and disconnected`
    : `N/A for ${t}. ${t} has no REST API, so the Web API stays off`;
}
export const naTooltip = (tool: string): string =>
  `N/A for ${toolLabel(tool)}: no web UI or REST API outside the cluster`;

const REASON_TEXT: Record<string, string> = {
  tool_not_supported: "The tool has no such surface",
  team_limit: "Above the team's endpoint limit, so the edge serves a lower level",
  service_switch_public: "Public endpoints are switched off for the service",
  service_switch_private: "Private endpoints are switched off for the service",
  base_domain_unset: "The service has no base domain for this level yet",
  provider_without_collab_client:
    "Your sign-in provider has no collaboration client; ask a service admin",
  exposure_above_limit: "Above the team's endpoint limit",
  surface_not_supported_by_tool: "The tool has no such surface",
  registration_mode_not_supported: "Manual registration is not available for this tool",
  collaboration_agent_not_ready: "Managed registration needs the orchestration agent to be Ready",
  orchestration_field_fixed: "This field is fixed on the orchestration agent",
  orchestration_agent_pending: "Orchestration agent being created",
  tool_unchanged: "The team already uses this tool",
  tool_not_enabled: "This tool is not enabled for the service",
  tool_change_in_progress: "A tool change is already running",
  orchestration_runtime_unset: "The service has no runtime for this tool yet",
  team_suspended: "The team is suspended",
};
/** The text of a reason; an unknown reason is shown as its raw string, never an error. */
export const reasonText = (reason: string): string => REASON_TEXT[reason] ?? reason;

/** The state word of a surface: the effective level, with Off hollow (dot plus word). */
export function exposureView(level: string): PhaseView {
  if (level === "public") return { word: "Public", dot: "amber" };
  if (level === "private") return { word: "Private", dot: "blue" };
  return { word: "Off", dot: "grey" };
}

export interface ExposureOption {
  readonly value: Exposure;
  readonly label: string;
  /** Why this option cannot be chosen; the option stays visible, so assistive technology hears it. */
  readonly disabledReason?: string;
}

/** The three options of a segmented control: above the limit or unsupported options are disabled with the reason. */
export function exposureOptions(o: {
  readonly limit: string;
  readonly supported: boolean;
  readonly tool: string;
}): ExposureOption[] {
  return EXPOSURES.map((value) => {
    if (value === "off") return { value, label: EXPOSURE_LABEL[value] };
    if (!o.supported)
      return { value, label: EXPOSURE_LABEL[value], disabledReason: naTooltip(o.tool) };
    if (aboveLimit(value, o.limit))
      return {
        value,
        label: EXPOSURE_LABEL[value],
        disabledReason: `Above this team's limit (${exposureLabel(o.limit)}). A service admin sets the limit`,
      };
    return { value, label: EXPOSURE_LABEL[value] };
  });
}

/** The warning shown before *Public* is saved (PRD section 5.3, T17 Edit endpoints). */
export const PUBLIC_WARNING =
  "Public makes this surface reachable from the internet. It stays behind the WAF, sign-in and AFS roles. The change is audited and applies within 60 seconds.";

export interface OpenToolInput {
  readonly tool: string;
  readonly hostname: string | null;
  readonly supported: boolean;
  readonly effective: string;
  readonly reasons: readonly string[];
  readonly teamState?: string | undefined;
  readonly phase: string;
  readonly canAccess: boolean;
}

/**
 * Whether *Open <tool>* is enabled, and if not why. The precedence is fixed: the caller needs
 * `collaboration:access`; then a tool without a web UI; then a Web UI that is off; then a missing hostname;
 * then a suspended team; then a phase that is not Ready (ORC-23).
 */
export function openToolState(i: OpenToolInput): { enabled: boolean; reason?: string } {
  if (!i.canAccess) return { enabled: false, reason: "Requires team-viewer" };
  if (!i.supported) return { enabled: false, reason: naTooltip(i.tool) };
  if (i.effective === "off") {
    const first = i.reasons.find((r) => r !== "provider_without_collab_client") ?? i.reasons[0];
    return {
      enabled: false,
      reason: first ? reasonText(first) : "The Web UI is off. A team-admin can turn it on.",
    };
  }
  if (i.hostname === null) return { enabled: false, reason: "No address is configured" };
  if (i.teamState === "suspended") return { enabled: false, reason: "Team is suspended" };
  if (i.phase !== "Ready")
    return { enabled: false, reason: `The orchestration agent is ${i.phase}` };
  return { enabled: true };
}

/** The condition types of the tool panel, in the order shown. `UnmanagedToolAgents` is inverted (False is healthy). */
export const CONDITION_TYPES = [
  "EndpointReady",
  "ToolReady",
  "RegistrationHealthy",
  "UnmanagedToolAgents",
] as const;
export const INVERTED_CONDITIONS: readonly string[] = ["UnmanagedToolAgents", "ToolChanging"];

export interface ConditionLike {
  readonly type: string;
  readonly status: string;
}

/** True when every named condition is healthy (an unknown or missing one is not). */
export function allHealthy(conds: readonly ConditionLike[]): boolean {
  return CONDITION_TYPES.every((t) => {
    const c = conds.find((x) => x.type === t);
    if (!c) return false;
    return INVERTED_CONDITIONS.includes(t) ? c.status === "False" : c.status === "True";
  });
}

/** `managedBy` labels of the tool-managed secrets (ORC-10). */
export const managedByLabel = (managedBy: string | undefined): string =>
  managedBy === "afs"
    ? "Managed by AFS"
    : managedBy === "paperclip"
      ? "Managed by Paperclip"
      : managedBy === "buzz"
        ? "Managed by Buzz"
        : managedBy && managedBy !== "user"
          ? managedBy
          : "Team";

/** The secrets of the orchestration agent that AFS or its tool manage. */
export const isToolManaged = (
  s: { readonly managedBy?: string | undefined; readonly agentId?: string | undefined },
  orchestrationAgentId: string,
): boolean =>
  (s.managedBy === "afs" || s.managedBy === "paperclip" || s.managedBy === "buzz") &&
  s.agentId === orchestrationAgentId;

/** Reserved secret-name prefixes of the tools (ORC-10). */
export function reservedSecretName(name: string, scope: string): boolean {
  if (name === "paperclip-agent-api-key" && scope === "agent") return false;
  if (name === "buzz-agent-private-key" && scope === "agent") return false;
  return (
    name === "paperclip" ||
    name.startsWith("paperclip-") ||
    name === "buzz" ||
    name.startsWith("buzz-")
  );
}
export const RESERVED_NAME_TEXT = "This name is reserved for the collaboration tool";

/** True for the agent role the API reads as the orchestration agent (a 1.0.1 `collaboration` reads as one too). */
export const isOrchestrationRole = (role: string | undefined): boolean =>
  role === "orchestration" || role === "collaboration";

/** The `ValidationError` reasons of orchestration changes mapped to the change dialog's text. */
export const changeToolWarning = (from: string, to: string): string =>
  `${toolLabel(to)} starts with an empty data directory. ${toolLabel(from)}'s content is not moved; its data stays in a snapshot kept for 90 days. Connected agents are re-registered, and surfaces ${toolLabel(to)} lacks turn off.`;

// ---- the afs commands (ORC-24) ----

/**
 * `afs orchestration put-orchestration`; ORC-29 names the flags `--web-ui-exposure` and `--web-api-exposure`.
 * `--if-match` carries the version the page was showing.
 */
export function putOrchestrationCli(
  teamId: string,
  v: {
    webUi: string;
    webApi: string;
    registrationMode?: string | undefined;
    version?: number | undefined;
  },
): CliCommand {
  return {
    service: "orchestration",
    operation: "put-orchestration",
    args: [
      ["team-id", teamId],
      ["web-ui-exposure", v.webUi],
      ["web-api-exposure", v.webApi],
      ["registration-mode", v.registrationMode],
      ["if-match", v.version === undefined ? undefined : String(v.version)],
    ],
  };
}

export const changeToolCli = (teamId: string, tool: string): CliCommand =>
  buildCli("ChangeCollaborationTool", { teamId, tool });

export const describeOrchestrationCli = (teamId: string): CliCommand =>
  buildCli("GetTeamOrchestration", { teamId });

/** `afs teams update-team --max-collaboration-exposure`. */
export const setLimitCli = (teamId: string, limit: string): CliCommand =>
  buildCli("UpdateTeam", { teamId, maxCollaborationExposure: limit });

/** The `--orchestration Tool=…,WebUiExposure=…` shorthand of `create-team` (ORC-29). */
export function orchestrationShorthand(o: {
  tool: string;
  webUiExposure: string;
  webApiExposure: string;
  modelId?: string | undefined;
}): string {
  return [
    `Tool=${o.tool}`,
    `WebUiExposure=${o.webUiExposure}`,
    `WebApiExposure=${o.webApiExposure}`,
    ...(o.modelId ? [`ModelId=${o.modelId}`] : []),
  ].join(",");
}

/** `--connect` / `--no-connect` style flag of a worker's collaboration section. */
export const connectFlag = (on: boolean) => boolFlag("collaboration-connect", on);

/** A team id shortened for the CLI panel: 12 characters and an ellipsis. */
export const shortId = (id: string): string => (id.length > 12 ? `${id.slice(0, 12)}…` : id);

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

// ---- the service settings of the Orchestration page (S12, WEB-US-57) ----

/** The edge settings that keep their 1.0.1 `collab.*` keys, in the order shown. */
export const EDGE_SETTING_KEYS = [
  "collab.allowed_source_cidrs",
  "collab.session_ttl_minutes",
  "collab.content_scan",
  "collab.max_body_mb",
  "collab.denied_spike_threshold",
] as const;

/** The base domains and kill switches (renamed from `collab.base_domain` and `collab.public_endpoints`). */
export const SWITCH_SETTING_KEYS = [
  "orchestration.public_endpoints",
  "orchestration.private_endpoints",
] as const;
export const DOMAIN_SETTING_KEYS = [
  "orchestration.public_base_domain",
  "orchestration.private_base_domain",
] as const;
export const DEFAULT_SETTING_KEYS = [
  "orchestration.default_limit",
  "orchestration.default_web_ui_exposure",
  "orchestration.default_web_api_exposure",
  "orchestration.default_resources",
  "orchestration.default_volume_gib",
] as const;

/** Keys that S12 owns; the generic *Settings* section does not list them. */
export const isOrchestrationSetting = (key: string): boolean =>
  key.startsWith("collab.") || key.startsWith("orchestration.");

/** The confirmation a change of one of these settings needs, or `undefined` when none. */
export function orchestrationConfirmation(
  key: string,
  current: string,
  next: string,
): string | undefined {
  if (current === next) return undefined;
  if (key.endsWith("_base_domain")) return "Every team's address at that level changes.";
  if (key.endsWith("_endpoints") && next === "false")
    return "Every team's endpoint at that level stops within a minute. Teams' choices are kept.";
  if (key === "collab.content_scan" && next === "off")
    return "Credentials typed into the collaboration tool will no longer be blocked or detected.";
  if (key === "collab.allowed_source_cidrs" && next.trim() !== "")
    return "Requests from outside these ranges are blocked by the firewall.";
  return undefined;
}

/** The text of a setting for its field: CIDRs one per line, objects as JSON, everything else as text. */
export function settingFieldText(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.join(key === "collab.allowed_source_cidrs" ? "\n" : ", ");
  if (value !== null && typeof value === "object") return JSON.stringify(value, null, 2);
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
