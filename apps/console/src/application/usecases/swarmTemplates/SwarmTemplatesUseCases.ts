import * as money from "../../../domain/money.js";
import { AppError } from "../../errors.js";
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
};

export const draftOf = (t: SwarmTemplateRecord): TemplateDraft => ({
  name: t.name,
  kind: t.kind as TemplateDraft["kind"],
  description: t.description ?? "",
  budgetUsd: t.budgetUsd,
  ttlHours: String(t.ttlHours),
  teardownRule: t.teardownRule as TeardownRule,
  specText: specText(t.spec),
});

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
      spec: parseSpec(d.specText).spec as SwarmTemplateSpec,
    };
    return this.port.create(input);
  }
  /** Sends only what changed against `t`. */
  update(t: SwarmTemplateRecord, d: TemplateDraft) {
    const fields = validateTemplate(d, false);
    if (Object.keys(fields).length > 0) return Promise.reject(invalid(fields));
    const spec = parseSpec(d.specText).spec as SwarmTemplateSpec;
    const budget = money.toMoney(money.parse(d.budgetUsd.trim()));
    const patch: SwarmTemplatePatch = {
      ...(d.description.trim() !== (t.description ?? "") && { description: d.description.trim() }),
      ...(money.compare(budget, t.budgetUsd) !== 0 && { budgetUsd: budget }),
      ...(Number(d.ttlHours) !== t.ttlHours && { ttlHours: Number(d.ttlHours) }),
      ...(d.teardownRule !== t.teardownRule && { teardownRule: d.teardownRule }),
      ...(specText(spec) !== specText(t.spec) && { spec }),
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
