// Reads the `orchestration.*` and `models.*` service settings the screens need (S3 defaults, S4, S12).
import type { SettingRecord } from "../../ports/settings.js";
import { FALLBACK_DEFAULTS, type OrchestrationDefaults } from "../teams/teamDraft.js";

/** The keys of the service *Orchestration* page, by tab (ORC-18, section 6.8). */
export const ORCH_KEYS = {
  tools: "orchestration.tools",
  publicBase: "orchestration.public_base_domain",
  privateBase: "orchestration.private_base_domain",
  publicEndpoints: "orchestration.public_endpoints",
  privateEndpoints: "orchestration.private_endpoints",
  defaultLimit: "orchestration.default_limit",
  defaultWebUi: "orchestration.default_web_ui_exposure",
  defaultWebApi: "orchestration.default_web_api_exposure",
  defaultResources: "orchestration.default_resources",
  defaultVolume: "orchestration.default_volume_gib",
  serviceAccess: "models.service_access",
  defaultTeamAccess: "models.default_team_access",
  defaultModel: "models.default_model_id",
} as const;

export const settingOf = (list: readonly SettingRecord[], key: string): SettingRecord | undefined =>
  list.find((s) => s.key === key);

const str = (v: unknown, fallback: string): string => (typeof v === "string" && v ? v : fallback);

/** One entry of `orchestration.tools`: the profile and the runtime mapping (service admins see the template). */
export interface ToolSetting {
  readonly tool: string;
  readonly enabled: boolean;
  readonly default: boolean;
  readonly templateId: string | null;
  readonly webUi: boolean;
  readonly webApi: boolean;
  readonly registration: readonly string[];
  readonly inNamespacePort: number | undefined;
}

export function toolSettings(list: readonly SettingRecord[]): ToolSetting[] {
  const v = settingOf(list, ORCH_KEYS.tools)?.value;
  if (!v || typeof v !== "object") return [];
  return Object.entries(v as Record<string, Record<string, unknown>>).map(([tool, t]) => ({
    tool,
    enabled: t.enabled === true,
    default: t.default === true,
    templateId: typeof t.templateId === "string" ? t.templateId : null,
    webUi: t.webUi === true,
    webApi: t.webApi === true,
    registration: Array.isArray(t.registration) ? (t.registration as string[]) : [],
    inNamespacePort: typeof t.inNamespacePort === "number" ? t.inNamespacePort : undefined,
  }));
}

/** The defaults S3 stands for when a field is empty; falls back to the documented defaults while unread. */
export function orchestrationDefaults(
  list: readonly SettingRecord[] | undefined,
): OrchestrationDefaults {
  if (!list) return FALLBACK_DEFAULTS;
  const tools = toolSettings(list);
  return {
    tool: tools.find((t) => t.default)?.tool ?? FALLBACK_DEFAULTS.tool,
    limit: str(settingOf(list, ORCH_KEYS.defaultLimit)?.value, FALLBACK_DEFAULTS.limit),
    webUi: str(settingOf(list, ORCH_KEYS.defaultWebUi)?.value, FALLBACK_DEFAULTS.webUi),
    webApi: str(settingOf(list, ORCH_KEYS.defaultWebApi)?.value, FALLBACK_DEFAULTS.webApi),
  };
}

/** The service's model access (`all` until read). */
export const serviceAccessOf = (list: readonly SettingRecord[] | undefined): "all" | "selected" =>
  settingOf(list ?? [], ORCH_KEYS.serviceAccess)?.value === "selected" ? "selected" : "all";
