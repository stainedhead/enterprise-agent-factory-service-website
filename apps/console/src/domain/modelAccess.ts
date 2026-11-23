// Pure model-access rules (MOD-1 to MOD-8): all or selected models at the service, team and agent level, one
// default model per agent, the effective set a level allows and the `afs` flags of the model controls. A level
// never edits the stored selection of a level below it (MOD-6), so dropped-out models are shown, not removed.
import { buildCli, type CliCommand } from "./cli.js";

export type ModelAccess = "all" | "selected";
export const isModelAccess = (v: string): v is ModelAccess => v === "all" || v === "selected";

/** The `models` object of an agent or pool. */
export interface ModelsSpec {
  readonly access: ModelAccess;
  /** Meaningful when `access` is `selected`; kept (not cleared) when it is `all`. */
  readonly modelIds: readonly string[];
  readonly defaultModelId: string;
}

/** What the level above allows, with the name to show. */
export interface ModelChoice {
  readonly id: string;
  readonly displayName: string;
}

/** The models an agent may call within `allowed` (what its team may use): `all` follows the team list. */
export function effectiveModelIds(spec: ModelsSpec, allowed: readonly string[]): string[] {
  if (spec.access === "all") return [...allowed];
  return spec.modelIds.filter((id) => allowed.includes(id));
}

/** Stored selections the level above no longer allows: shown struck through with the reason (MOD-6). */
export const droppedModelIds = (spec: ModelsSpec, allowed: readonly string[]): string[] =>
  spec.access === "selected" ? spec.modelIds.filter((id) => !allowed.includes(id)) : [];

export interface ModelErrors {
  models?: string;
  defaultModelId?: string;
}

/** Client-side checks (the API repeats them): a selection of at least one allowed model and an allowed default. */
export function validateModels(spec: ModelsSpec, allowed: readonly string[]): ModelErrors {
  const e: ModelErrors = {};
  const eff = effectiveModelIds(spec, allowed);
  if (spec.access === "selected" && spec.modelIds.length === 0)
    e.models = "Choose at least one model";
  else if (spec.access === "selected" && eff.length === 0)
    e.models = "None of the chosen models is allowed for this team";
  if (!spec.defaultModelId) e.defaultModelId = "Choose a default model";
  else if (!eff.includes(spec.defaultModelId))
    e.defaultModelId = "The default model must be one of the agent's models";
  return e;
}

/** Keeps the default valid after the access or the selection changed: the first effective model when it left. */
export function withValidDefault(spec: ModelsSpec, allowed: readonly string[]): ModelsSpec {
  const eff = effectiveModelIds(spec, allowed);
  if (eff.includes(spec.defaultModelId) || eff.length === 0) return spec;
  return { ...spec, defaultModelId: eff[0] as string };
}

/** `Selected, 3 of 4 team models` or `All team models (4)`. */
export function modelsCountText(
  spec: ModelsSpec,
  allowedCount: number,
  noun = "team models",
): string {
  return spec.access === "all"
    ? `All ${noun} (${allowedCount})`
    : `Selected, ${spec.modelIds.length} of ${allowedCount} ${noun}`;
}

/** T2's *Model* column: the default model and `+2` when the agent has more (PRD 5.3a). */
export function modelsColumn(
  spec: Pick<ModelsSpec, "defaultModelId"> & { effectiveModelIds?: readonly string[] | undefined },
  nameOf: (id: string) => string = (id) => id,
): string {
  const more = (spec.effectiveModelIds?.length ?? 1) - 1;
  return `${nameOf(spec.defaultModelId)}${more > 0 ? ` +${more}` : ""}`;
}

/** The body `models` of `CreateAgent`, `UpdateAgent`, `CreatePool` and `UpdatePool`. */
export const toModelsBody = (spec: ModelsSpec) => ({
  access: spec.access,
  ...(spec.access === "selected" ? { modelIds: [...spec.modelIds] } : {}),
  defaultModelId: spec.defaultModelId,
});

/** `--models all | <id> …` and `--default-model-id <id>` (MOD-8). */
export const modelFlags = (
  spec: ModelsSpec,
): readonly (readonly [string, string | readonly string[] | undefined])[] => [
  ["models", spec.access === "all" ? "all" : spec.modelIds],
  ["default-model-id", spec.defaultModelId],
];

export const putTeamModelsCli = (
  teamId: string,
  v: { access: ModelAccess; modelIds: readonly string[] },
): CliCommand =>
  buildCli("PutTeamModels", {
    teamId,
    access: v.access,
    ...(v.access === "selected" ? { modelIds: [...v.modelIds] } : {}),
  });

export const putServiceModelAccessCli = (access: ModelAccess): CliCommand =>
  buildCli("PutServiceModelAccess", { access });

/** The price states of the catalog (S4): approved is callable, anything else waits for a price. */
export function priceView(state: string | undefined): {
  word: string;
  dot: "green" | "amber" | "grey";
} {
  if (state === "approved") return { word: "Approved", dot: "green" };
  if (state === "pending") return { word: "Waiting", dot: "amber" };
  return { word: "No price", dot: "grey" };
}

/** The reasons of the gateway's model refusals (MOD-5) in words, for the usage and agent screens. */
export const MODEL_DENIAL_TEXT: Record<string, string> = {
  model_not_enabled_for_service: "The service has not enabled this model",
  model_not_enabled_for_team: "This team may not use this model",
  model_not_enabled_for_agent: "This agent may not use this model",
  model_not_priced: "This model has no approved price yet",
};

/** Why a model dropped out of an agent's effective set, by the level that removed it. */
export function dropReason(
  id: string,
  levels: { service: readonly string[]; team: readonly string[] },
): string {
  if (!levels.service.includes(id)) return "Not enabled for the service";
  if (!levels.team.includes(id)) return "Not allowed for the team";
  return "Not allowed";
}
