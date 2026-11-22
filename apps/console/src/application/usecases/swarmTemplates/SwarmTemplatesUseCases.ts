import * as money from "../../../domain/money.js";
import { AppError } from "../../errors.js";
import type { AgentTemplateRecord } from "../../ports/agents.js";
import type {
  SwarmTemplateInput,
  SwarmTemplatePatch,
  SwarmTemplateRecord,
  SwarmTemplateSpec,
  SwarmTemplatesPort,
  TeardownRule,
} from "../../ports/swarmTemplates.js";

export const TEARDOWN_RULES: readonly { value: TeardownRule; label: string }[] = [
  { value: "at_expiry", label: "At expiry" },
  { value: "at_cap_or_expiry", label: "At spend cap or expiry" },
  { value: "at_work_complete", label: "When the work is complete" },
];
export const KINDS = [
  { value: "cve_remediation", label: "CVE remediation" },
  { value: "general", label: "General" },
] as const;
export const NAME = /^[a-z][a-z0-9-]{1,62}$/;
export const MAX_TTL_HOURS = 8760;

/** What the form holds; numbers and the spec are text until validated. */
export interface TemplateDraft {
  readonly name: string;
  readonly kind: "cve_remediation" | "general";
  readonly description: string;
  readonly budgetUsd: string;
  readonly ttlHours: string;
  readonly teardownRule: TeardownRule;
  readonly specText: string;
  /** The agent template (`tpl_…`) for the remediation team's collaboration agent; empty for none. */
  readonly collaborationTemplateId: string;
}

export const SPEC_KEYS = ["stages", "pools", "handoffs", "secrets", "configValues"] as const;

/** The spec as the editor shows it: the five sections in a fixed order. */
export const specText = (s: SwarmTemplateSpec): string =>
  JSON.stringify(
    {
      stages: s.stages,
      pools: s.pools,
      handoffs: s.handoffs ?? [],
      secrets: s.secrets ?? [],
      configValues: s.configValues ?? [],
    },
    null,
    2,
  );

export const emptyDraft: TemplateDraft = {
  name: "",
  kind: "cve_remediation",
  description: "",
  budgetUsd: "",
  ttlHours: "72",
  teardownRule: "at_work_complete",
  specText: specText({ stages: [], pools: [] }),
  collaborationTemplateId: "",
};

export const draftOf = (t: SwarmTemplateRecord): TemplateDraft => ({
  name: t.name,
  kind: t.kind as TemplateDraft["kind"],
  description: t.description ?? "",
  budgetUsd: t.budgetUsd,
  ttlHours: String(t.ttlHours),
  teardownRule: t.teardownRule as TeardownRule,
  specText: specText(t.spec),
  collaborationTemplateId: t.spec.collaboration?.templateId ?? "",
});

/** The agent templates a swarm template may name: enabled ones that carry the `paperclip` capability. */
export const collaborationChoices = (
  templates: readonly AgentTemplateRecord[],
): { value: string; label: string }[] =>
  templates
    .filter((t) => t.enabled && t.id !== undefined && t.capabilities?.includes("paperclip"))
    .map((t) => ({ value: t.id as string, label: t.name }));

/** The spec the API receives: the edited sections plus the collaboration choice. */
export function specOf(d: TemplateDraft): SwarmTemplateSpec {
  const spec = parseSpec(d.specText).spec as SwarmTemplateSpec;
  return d.collaborationTemplateId
    ? { ...spec, collaboration: { templateId: d.collaborationTemplateId } }
    : spec;
}

const SECRET_NAME = /^[a-z][a-z0-9-]{0,62}$/;
const ENV_TARGET = /^[A-Z_][A-Z0-9_]{0,127}$/;
const FILE_TARGET = /^\/[A-Za-z0-9._/-]{1,255}$/;

/** Template secrets are typed `{pool, name, description?, delivery?, target?}` (contract 1.1.0, ADR-013). */
function validateSecrets(
  secrets: readonly Record<string, unknown>[],
  poolNames: ReadonlySet<string>,
): string | undefined {
  const seen = new Set<string>();
  const targets = new Set<string>();
  for (const [i, x] of secrets.entries()) {
    const at = `Secret ${i + 1}`;
    if (typeof x.pool !== "string" || !x.pool) return `${at} needs a "pool"`;
    if (typeof x.name !== "string" || !x.name) return `${at} needs a "name"`;
    if (!poolNames.has(x.pool)) return `${at}: pool "${x.pool}" is not defined in this template`;
    if (!SECRET_NAME.test(x.name))
      return `${at}: use lower-case letters, digits and hyphens for the name, starting with a letter`;
    if (seen.has(x.name)) return `${at}: duplicate secret "${x.name}"`;
    seen.add(x.name);
    if (x.delivery !== undefined && x.delivery !== "env" && x.delivery !== "file")
      return `${at}: delivery must be env or file`;
    if (
      x.description !== undefined &&
      (typeof x.description !== "string" || x.description.length > 1000)
    )
      return `${at}: description must be text of at most 1000 characters`;
    if (x.target !== undefined) {
      const file = x.delivery === "file";
      if (typeof x.target !== "string" || !(file ? FILE_TARGET : ENV_TARGET).test(x.target))
        return file
          ? `${at}: a file target is an absolute path`
          : `${at}: an environment variable target uses upper-case letters, digits and underscores`;
      const key = `${x.pool}:${x.target}`;
      if (targets.has(key)) return `${at}: target "${x.target}" is used twice in pool "${x.pool}"`;
      targets.add(key);
    }
  }
  if (secrets.length > 100) return "A template holds at most 100 secrets";
  return undefined;
}

/** Parses the spec text: an object whose `stages` and `pools` are non-empty arrays; other sections are arrays. */
export function parseSpec(text: string): { spec?: SwarmTemplateSpec; error?: string } {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { error: "The spec is not valid JSON" };
  }
  if (!v || typeof v !== "object" || Array.isArray(v))
    return { error: "The spec must be an object" };
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o))
    if (!SPEC_KEYS.includes(k as (typeof SPEC_KEYS)[number]))
      return { error: `Unknown spec section "${k}"` };
  for (const k of SPEC_KEYS)
    if (o[k] !== undefined && !Array.isArray(o[k])) return { error: `"${k}" must be a list` };
  for (const k of SPEC_KEYS)
    for (const item of (o[k] as unknown[] | undefined) ?? [])
      if (!item || typeof item !== "object" || Array.isArray(item))
        return { error: `Each entry of "${k}" must be an object` };
  const stages = (o.stages as Record<string, unknown>[] | undefined) ?? [];
  const pools = (o.pools as Record<string, unknown>[] | undefined) ?? [];
  if (stages.length === 0) return { error: "Add at least one stage" };
  if (pools.length === 0) return { error: "Add at least one pool" };
  const secretError = validateSecrets(
    (o.secrets as Record<string, unknown>[] | undefined) ?? [],
    new Set(pools.map((x) => String(x.name))),
  );
  if (secretError) return { error: secretError };
  return {
    spec: {
      stages,
      pools,
      ...(o.handoffs !== undefined && { handoffs: o.handoffs as Record<string, unknown>[] }),
      ...(o.secrets !== undefined && { secrets: o.secrets as Record<string, unknown>[] }),
      ...(o.configValues !== undefined && {
        configValues: o.configValues as Record<string, unknown>[],
      }),
    },
  };
}

/** Form errors keyed by field (`name`, `budgetUsd`, `ttlHours`, `spec`); empty when the draft can be sent. */
export function validateTemplate(d: TemplateDraft, creating: boolean): Record<string, string> {
  const e: Record<string, string> = {};
  if (creating && !NAME.test(d.name))
    e.name = "Use 2 to 63 lower-case letters, digits and hyphens, starting with a letter";
  try {
    if (!d.budgetUsd.trim() || money.parse(d.budgetUsd.trim()) <= 0n)
      e.budgetUsd = "Enter a cap above 0";
  } catch {
    e.budgetUsd = "Enter an amount such as 500.00";
  }
  const ttl = Number(d.ttlHours);
  if (!/^\d+$/.test(d.ttlHours.trim()) || ttl < 1 || ttl > MAX_TTL_HOURS)
    e.ttlHours = `Enter whole hours from 1 to ${MAX_TTL_HOURS}`;
  const p = parseSpec(d.specText);
  if (p.error) e.spec = p.error;
  return e;
}

const invalid = (fields: Record<string, string>) =>
  new AppError({
    kind: "validation",
    message: Object.values(fields)[0] ?? "Check the template",
    fields,
  });

/** A readable summary of a spec for the detail view. */
export function summarise(s: SwarmTemplateSpec) {
  const name = (x: Readonly<Record<string, unknown>>) => String(x.name ?? "—");
  return {
    stages: [...s.stages]
      .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
      .map((x) => name(x)),
    pools: s.pools.map(
      (x) => `${name(x)}${x.workers !== undefined ? ` (${String(x.workers)} workers)` : ""}`,
    ),
    handoffs: (s.handoffs ?? []).map(
      (h) => `${String(h.from ?? "?")} → ${[h.to].flat().join(", ")}`,
    ),
    secrets: (s.secrets ?? []).map(name),
    configValues: (s.configValues ?? []).map(name),
  };
}

/** Use cases of P5 and the template reads of *Create work order*. */
export class SwarmTemplatesUseCases {
  constructor(private readonly port: SwarmTemplatesPort) {}

  list(signal?: AbortSignal): Promise<readonly SwarmTemplateRecord[]> {
    return this.port.list(signal);
  }
  /** Templates offered in *Create work order*: enabled only. */
  async enabled(signal?: AbortSignal): Promise<readonly SwarmTemplateRecord[]> {
    return (await this.port.list(signal)).filter((t) => t.enabled);
  }
  create(d: TemplateDraft) {
    const fields = validateTemplate(d, true);
    if (Object.keys(fields).length > 0) return Promise.reject(invalid(fields));
    const input: SwarmTemplateInput = {
      name: d.name,
      kind: d.kind,
      ...(d.description.trim() && { description: d.description.trim() }),
      budgetUsd: money.toMoney(money.parse(d.budgetUsd.trim())),
      ttlHours: Number(d.ttlHours),
      teardownRule: d.teardownRule,
      enabled: false,
      spec: specOf(d),
    };
    return this.port.create(input);
  }
  /** Sends only what changed against `t`. */
  update(t: SwarmTemplateRecord, d: TemplateDraft) {
    const fields = validateTemplate(d, false);
    if (Object.keys(fields).length > 0) return Promise.reject(invalid(fields));
    const spec = specOf(d);
    const budget = money.toMoney(money.parse(d.budgetUsd.trim()));
    const patch: SwarmTemplatePatch = {
      ...(d.description.trim() !== (t.description ?? "") && { description: d.description.trim() }),
      ...(money.compare(budget, t.budgetUsd) !== 0 && { budgetUsd: budget }),
      ...(Number(d.ttlHours) !== t.ttlHours && { ttlHours: Number(d.ttlHours) }),
      ...(d.teardownRule !== t.teardownRule && { teardownRule: d.teardownRule }),
      ...((specText(spec) !== specText(t.spec) ||
        d.collaborationTemplateId !== (t.spec.collaboration?.templateId ?? "")) && { spec }),
    };
    if (Object.keys(patch).length === 0)
      return Promise.reject(new AppError({ kind: "validation", message: "Nothing has changed" }));
    return this.port.update({ id: t.id, version: t.version }, patch);
  }
  enable(t: SwarmTemplateRecord) {
    return this.port.enable(t.id);
  }
  disable(t: SwarmTemplateRecord) {
    return this.port.disable(t.id);
  }
  delete(t: SwarmTemplateRecord) {
    return this.port.delete({ id: t.id, version: t.version });
  }
}
