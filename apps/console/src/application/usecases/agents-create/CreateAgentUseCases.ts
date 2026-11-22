import { isValidName } from "../../../domain/names.js";
import { AppError } from "../../errors.js";
import type { AgentRecord, SecretBindingRecord } from "../../ports/agents.js";
import type { ConfigValueRecord } from "../../ports/configValues.js";
import type { AgentsUseCases } from "../agents/AgentsUseCases.js";
import { type ConfigUseCases, checkConfigName } from "../config/ConfigUseCases.js";

/** One configuration value row of the create form. */
export interface ConfigRow {
  readonly name: string;
  /** `namespace` takes the team's value of the same name; `literal` is the agent's own. */
  readonly source: "namespace" | "literal";
  readonly value: string;
}

export interface BindingRow {
  readonly secretId: string;
  readonly delivery: "env" | "file";
  readonly target: string;
}

/** Everything the T3 form holds. */
export interface CreateAgentDraft {
  readonly name: string;
  readonly template: string;
  readonly image: string;
  /** The persona and instructions: the API's only free-text field is `description` (CQ-14). */
  readonly persona: string;
  readonly modelId: string;
  readonly cpu: string;
  readonly memory: string;
  readonly sizeGiB: string;
  readonly storageClass: string;
  readonly onDelete: string;
  readonly snapshotSchedule: string;
  readonly snapshotRetain: string;
  readonly iamIdentity: "team_shared" | "dedicated";
  readonly config: readonly ConfigRow[];
  readonly bindings: readonly BindingRow[];
}

export const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MIN_SIZE_GIB = 1;
export const MAX_SIZE_GIB = 1000;

export type DraftErrors = Readonly<Record<string, string>>;

/**
 * Client-side checks of the form (the API repeats them): the keys are the form's field ids, which match the
 * API's field names where one exists, so an API `ValidationError` lands on the same input.
 */
export function validateDraft(
  d: CreateAgentDraft,
  namespaceNames: readonly string[] = [],
): DraftErrors {
  const e: Record<string, string> = {};
  if (!isValidName(d.name.trim()))
    e.name = "Use 3 to 40 lower-case letters, digits and hyphens, starting with a letter";
  if (!d.template) e.template = "Choose a template";
  if (!d.image.trim()) e.image = "Enter the image, pinned by digest";
  if (!d.modelId) e.modelId = "Choose a model";
  const size = Number(d.sizeGiB);
  if (!Number.isInteger(size) || size < MIN_SIZE_GIB || size > MAX_SIZE_GIB)
    e["volume.sizeGiB"] = `Enter a whole number from ${MIN_SIZE_GIB} to ${MAX_SIZE_GIB}`;
  const names = new Set<string>();
  d.config.forEach((c, i) => {
    const bad = checkConfigName(c.name.trim());
    if (bad) e[`config.${i}.name`] = bad.fields.name ?? bad.message;
    else if (names.has(c.name.trim())) e[`config.${i}.name`] = "This name is used twice";
    names.add(c.name.trim());
    if (c.source === "namespace" && !namespaceNames.includes(c.name.trim()))
      e[`config.${i}.source`] = "The namespace has no value with this name";
    if (c.source === "literal" && c.value === "") e[`config.${i}.value`] = "Enter a value";
  });
  const configNames = new Set(d.config.map((c) => c.name.trim()));
  const targets = new Set<string>();
  d.bindings.forEach((b, i) => {
    if (!b.secretId) e[`binding.${i}.secretId`] = "Choose a secret";
    const t = b.target.trim();
    if (!t)
      e[`binding.${i}.target`] =
        b.delivery === "env" ? "Enter an environment variable name" : "Enter a file path";
    else if (b.delivery === "env" && !ENV_NAME.test(t))
      e[`binding.${i}.target`] = "Use letters, digits and underscores, not starting with a digit";
    else if (b.delivery === "env" && configNames.has(t))
      e[`binding.${i}.target`] = `${t} is already a configuration value of this agent`;
    else if (b.delivery === "file" && !t.startsWith("/"))
      e[`binding.${i}.target`] = "Enter an absolute path";
    else if (targets.has(`${b.delivery}:${t}`))
      e[`binding.${i}.target`] = "This target is used twice";
    targets.add(`${b.delivery}:${t}`);
  });
  return e;
}

/** What `create` returns: the agent, and any configuration values the API refused after the agent existed. */
export interface CreateAgentResult {
  readonly agent: AgentRecord;
  readonly configFailures: readonly { readonly name: string; readonly message: string }[];
}

/** Create agent (M2-C1): `CreateAgent`, then one `PutAgentConfigValue` per row (the contract has no config on create). */
export class CreateAgentUseCases {
  constructor(
    private readonly agents: AgentsUseCases,
    private readonly config: ConfigUseCases,
  ) {}

  async create(
    teamId: string,
    d: CreateAgentDraft,
    namespace: readonly ConfigValueRecord[] = [],
  ): Promise<CreateAgentResult> {
    const errors = validateDraft(
      d,
      namespace.map((v) => v.name),
    );
    if (Object.keys(errors).length > 0)
      throw new AppError({
        kind: "validation",
        message: "Check the highlighted fields",
        fields: errors,
      });
    const bindings: SecretBindingRecord[] = d.bindings.map((b) => ({
      secretId: b.secretId,
      delivery: b.delivery,
      target: b.target.trim(),
    }));
    const agent = await this.agents.create(teamId, {
      name: d.name.trim(),
      template: d.template,
      image: d.image.trim(),
      modelId: d.modelId,
      iamIdentity: d.iamIdentity,
      ...(d.persona.trim() && { description: d.persona.trim() }),
      ...((d.cpu || d.memory) && {
        resources: { ...(d.cpu && { cpu: d.cpu }), ...(d.memory && { memory: d.memory }) },
      }),
      volume: {
        sizeGiB: Number(d.sizeGiB),
        ...(d.storageClass && { storageClass: d.storageClass }),
        onDelete: d.onDelete,
        snapshotSchedule: d.snapshotSchedule,
        ...(d.snapshotSchedule !== "off" &&
          d.snapshotRetain && { snapshotRetain: Number(d.snapshotRetain) }),
      },
      ...(bindings.length > 0 && { secretBindings: bindings }),
    });
    const configFailures: { name: string; message: string }[] = [];
    for (const c of d.config) {
      try {
        await this.config.putAgent(teamId, agent.id, c.name, {
          source: c.source,
          ...(c.source === "literal" && { value: c.value }),
        });
      } catch (e) {
        configFailures.push({
          name: c.name,
          message: e instanceof Error ? e.message : "Not saved",
        });
      }
    }
    return { agent, configFailures };
  }
}
