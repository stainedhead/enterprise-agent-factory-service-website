import type { ModelAccess } from "../../../domain/modelAccess.js";
import { compare, parse } from "../../../domain/money.js";
import { isValidName } from "../../../domain/names.js";
import { aboveLimit, toolInfo } from "../../../domain/orchestration.js";
import type { CreateTeamInput, ServiceTagRecord } from "../../ports/teams.js";
import {
  DEFAULT_EPHEMERAL_MAX_DAYS,
  type EphemeralDraft,
  emptyEphemeral,
  expiryTimestamp,
  validateEphemeral,
} from "./ephemeral.js";

/** The S3 wizard's form state (strings, as typed). */
export interface TeamDraft {
  displayName: string;
  slug: string;
  kind: "persistent" | "ephemeral";
  costCenter: string;
  description: string;
  ownerEmail: string;
  identityProviderId: string;
  /** Values for required service tags, by key. */
  tags: Record<string, string>;
  /** The team's list; meaningful with `modelAccess: selected` (MOD-2). */
  models: string[];
  /** `all` follows the service list now and later (default); `selected` is the list above. */
  modelAccess: ModelAccess;
  /** The endpoint limit; "" means the service default (ORC-14). Service admins only. */
  maxCollaborationExposure: string;
  /** The collaboration tool; "" means the service default (ORC-8). */
  orchTool: string;
  /** Starting Web UI and Web API levels; "" means the service default, lowered to the limit (ORC-26). */
  orchWebUi: string;
  orchWebApi: string;
  /** The orchestration agent's models and resources; "" means the service default. */
  orchModels: { access: ModelAccess; modelIds: string[]; defaultModelId: string };
  orchCpu: string;
  orchMemory: string;
  maxBudgetUsd: string;
  /** Alert thresholds in percent, comma separated: `50, 80, 100`. */
  thresholds: string;
  adminType: "user" | "group";
  adminEmail: string;
  adminGroup: string;
  /** Lifetime, expiry and teardown of an ephemeral team (M5-E); used only when `kind` is `ephemeral`. */
  ephemeral: EphemeralDraft;
}

export const emptyTeamDraft = (): TeamDraft => ({
  displayName: "",
  slug: "",
  kind: "persistent",
  costCenter: "",
  description: "",
  ownerEmail: "",
  identityProviderId: "",
  tags: {},
  models: [],
  modelAccess: "all",
  maxCollaborationExposure: "",
  orchTool: "",
  orchWebUi: "",
  orchWebApi: "",
  orchModels: { access: "all", modelIds: [], defaultModelId: "" },
  orchCpu: "",
  orchMemory: "",
  maxBudgetUsd: "",
  thresholds: "50, 80, 100",
  adminType: "user",
  adminEmail: "",
  adminGroup: "",
  ephemeral: emptyEphemeral(),
});

export type StepId = "details" | "orchestration" | "models" | "budget" | "members";
export type FieldErrors = Readonly<Record<string, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The service defaults an empty orchestration field stands for (from the `orchestration.*` settings). */
export interface OrchestrationDefaults {
  readonly tool: string;
  readonly limit: string;
  readonly webUi: string;
  readonly webApi: string;
}
export const FALLBACK_DEFAULTS: OrchestrationDefaults = {
  tool: "paperclip",
  limit: "private",
  webUi: "private",
  webApi: "off",
};

/** The levels the form shows: the draft's choice, else the service default lowered to the limit (never refused for a default). */
export function effectiveOrchestration(d: TeamDraft, defaults: OrchestrationDefaults) {
  const tool = d.orchTool || defaults.tool;
  const limit = d.maxCollaborationExposure || defaults.limit;
  const supports = toolInfo(tool);
  const lower = (level: string, supported: boolean) =>
    !supported ? "off" : aboveLimit(level, limit) ? limit : level;
  return {
    tool,
    limit,
    webUi: d.orchWebUi || lower(defaults.webUi, supports.webUi),
    webApi: d.orchWebApi || lower(defaults.webApi, supports.webApi),
  };
}

/** Service tags a creator must fill in: required mode, no default. */
export const requiredTags = (tags: readonly ServiceTagRecord[]): ServiceTagRecord[] =>
  tags.filter((t) => t.mode === "required");

/** Per-step validation; an empty result means *Next* is enabled (WEB-US-14.1). */
export function validateStep(
  step: StepId,
  d: TeamDraft,
  tags: readonly ServiceTagRecord[],
  opts: { ephemeralMaxDays?: number; now?: Date; defaults?: OrchestrationDefaults } = {},
): FieldErrors {
  const e: Record<string, string> = {};
  if (step === "orchestration") {
    const o = effectiveOrchestration(d, opts.defaults ?? FALLBACK_DEFAULTS);
    const info = toolInfo(o.tool);
    if (aboveLimit(o.webUi, o.limit)) e.orchWebUi = "Above the endpoint limit";
    else if (o.webUi !== "off" && !info.webUi) e.orchWebUi = "N/A for this tool";
    if (aboveLimit(o.webApi, o.limit)) e.orchWebApi = "Above the endpoint limit";
    else if (o.webApi !== "off" && !info.webApi) e.orchWebApi = "N/A for this tool";
    if (d.orchModels.access === "selected" && d.orchModels.modelIds.length === 0)
      e.orchModels = "Choose at least one model";
    else if (
      d.orchModels.access === "selected" &&
      d.orchModels.defaultModelId &&
      !d.orchModels.modelIds.includes(d.orchModels.defaultModelId)
    )
      e.orchDefaultModel = "The default model must be one of the models";
  }
  if (step === "details") {
    if (d.displayName.trim() === "") e.displayName = "Enter a display name";
    if (!isValidName(d.slug))
      e.slug = "Use 3 to 40 lowercase letters, digits and hyphens, starting with a letter";
    if (d.ownerEmail !== "" && !EMAIL.test(d.ownerEmail))
      e.ownerEmail = "Enter a valid email address";
    for (const t of requiredTags(tags)) {
      const v = d.tags[t.key];
      if (v === undefined || v === "") e[`tags.${t.key}`] = `Choose a value for ${t.key}`;
      else if (t.allowedValues && !t.allowedValues.includes(v))
        e[`tags.${t.key}`] = `${v} is not an allowed value`;
    }
  }
  if (step === "models" && d.modelAccess === "selected" && d.models.length === 0)
    e.models = "Choose at least one model";
  if (step === "budget" && d.kind === "ephemeral") {
    Object.assign(
      e,
      validateEphemeral(
        d.maxBudgetUsd,
        d.ephemeral,
        opts.ephemeralMaxDays ?? DEFAULT_EPHEMERAL_MAX_DAYS,
        opts.now ?? new Date(),
      ),
    );
    if (parseThresholds(d.thresholds) === undefined)
      e.thresholds = "Enter percentages between 1 and 100, for example 50, 80, 100";
  } else if (step === "budget") {
    try {
      if (compare(d.maxBudgetUsd, "0") <= 0) e.maxBudgetUsd = "Enter an amount above zero";
    } catch {
      e.maxBudgetUsd = "Enter an amount such as 5000.00";
    }
    if (parseThresholds(d.thresholds) === undefined)
      e.thresholds = "Enter percentages between 1 and 100, for example 50, 80, 100";
  }
  if (step === "members") {
    if (d.adminType === "user" && !EMAIL.test(d.adminEmail))
      e.adminEmail = "Enter the first admin's email";
    if (d.adminType === "group" && d.adminGroup.trim() === "")
      e.adminGroup = "Enter the group name";
  }
  return e;
}

/** `50, 80, 100` → `[50, 80, 100]`; undefined when any entry is not an integer from 1 to 100. */
export function parseThresholds(text: string): number[] | undefined {
  if (text.trim() === "") return [];
  const out: number[] = [];
  for (const part of text.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 1 || n > 100) return undefined;
    out.push(n);
  }
  return out;
}

/** The `CreateTeam` request for a valid draft. Throws when the budget is not a decimal. */
export function toCreateInput(d: TeamDraft): CreateTeamInput {
  parse(d.maxBudgetUsd);
  const thresholds = parseThresholds(d.thresholds) ?? [];
  const resources = {
    ...(d.orchCpu && { cpu: d.orchCpu }),
    ...(d.orchMemory && { memory: d.orchMemory }),
  };
  const orchModels = d.orchModels.defaultModelId
    ? {
        access: d.orchModels.access,
        ...(d.orchModels.access === "selected" && { modelIds: d.orchModels.modelIds }),
        defaultModelId: d.orchModels.defaultModelId,
      }
    : d.orchModels.access === "selected"
      ? { access: "selected" as const, modelIds: d.orchModels.modelIds }
      : undefined;
  const orchestration = {
    ...(d.orchTool && { tool: d.orchTool }),
    ...(d.orchWebUi && { webUiExposure: d.orchWebUi }),
    ...(d.orchWebApi && { webApiExposure: d.orchWebApi }),
    ...(orchModels && { models: orchModels }),
    ...(Object.keys(resources).length > 0 && { resources }),
  };
  return {
    displayName: d.displayName.trim(),
    slug: d.slug,
    kind: d.kind,
    maxBudgetUsd: d.maxBudgetUsd,
    ...(d.costCenter !== "" && { costCenter: d.costCenter }),
    ...(d.description !== "" && { description: d.description }),
    ...(d.ownerEmail !== "" && { ownerEmail: d.ownerEmail }),
    ...(d.identityProviderId !== "" && { identityProviderId: d.identityProviderId }),
    modelAccess: d.modelAccess,
    ...(d.modelAccess === "selected" && { models: d.models }),
    ...(d.maxCollaborationExposure && { maxCollaborationExposure: d.maxCollaborationExposure }),
    ...(Object.keys(orchestration).length > 0 && { orchestration }),
    tags: Object.entries(d.tags)
      .filter(([, v]) => v !== "")
      .map(([key, value]) => ({ key, value })),
    budget: {
      amountUsd: d.maxBudgetUsd,
      ...(d.kind === "ephemeral" && { period: "lifetime" }),
      ...(thresholds.length > 0 && { thresholds }),
    },
    ...(d.kind === "ephemeral" && {
      expiresAt: expiryTimestamp(d.ephemeral.expiresOn) ?? "",
      teardownRule: d.ephemeral.teardownRule,
    }),
    firstAdmin:
      d.adminType === "user"
        ? { subjectType: "user", email: d.adminEmail }
        : { subjectType: "group", groupName: d.adminGroup },
  };
}
