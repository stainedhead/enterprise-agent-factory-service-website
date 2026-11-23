import { toModelsBody } from "../../../domain/modelAccess.js";
import { AppError } from "../../errors.js";
import type { AgentsPort, AgentTemplateRecord } from "../../ports/agents.js";
import type {
  CreatePoolInput,
  PoolRecord,
  PoolRoleLinkRecord,
  PoolStatusRecord,
  PoolsPort,
  StageRecord,
} from "../../ports/pools.js";
import type { ReportsPort } from "../../ports/reports.js";
import {
  type CreateAgentDraft,
  type DraftErrors,
  validateDraft,
} from "../agents-create/CreateAgentUseCases.js";

export const MAX_WORKERS = 200;
export const MIN_SCRATCH_GIB = 1;
export const MAX_SCRATCH_GIB = 500;
export const MAX_STAGE_POSITION = 50;
const IAM_ROLE_NAME = /^[A-Za-z0-9+=,.@_-]{1,64}$/;

/** What the *Create pool* form holds: the agent form's fields (template, image, model, secrets, config) plus pool fields. */
export interface PoolDraft extends CreateAgentDraft {
  readonly workers: string;
  /** A stage id, or "" for none. */
  readonly stageId: string;
  /** Pool ids this pool hands work off to. */
  readonly handoffs: readonly string[];
  readonly scratchSizeGiB: string;
  readonly sharedVolume: "none" | "efs";
}

const invalid = (fields: Record<string, string>, message = "Check the highlighted fields") =>
  new AppError({ kind: "validation", message, fields });

const whole = (t: string): number | undefined => (/^\d+$/.test(t.trim()) ? Number(t) : undefined);

/**
 * Form checks of *Create pool* (WEB-US-39.2, 39.3): the agent form's rules for name, template, image, model,
 * configuration and secrets; workers 0 to 200; scratch 1 to 500 GiB; and the name unused by any agent or pool.
 */
export function validatePool(
  d: PoolDraft,
  taken: readonly string[] = [],
  namespaceNames: readonly string[] = [],
): DraftErrors {
  const e: Record<string, string> = {};
  for (const [k, m] of Object.entries(validateDraft(d, namespaceNames)))
    if (!k.startsWith("volume.")) e[k] = m;
  const n = d.name.trim();
  if (!e.name && taken.includes(n)) e.name = "An agent or pool of this team already has this name";
  const w = whole(d.workers);
  if (w === undefined || w > MAX_WORKERS)
    e.workers = `Enter a whole number from 0 to ${MAX_WORKERS}`;
  const g = whole(d.scratchSizeGiB);
  if (g === undefined || g < MIN_SCRATCH_GIB || g > MAX_SCRATCH_GIB)
    e.scratchSizeGiB = `Enter a whole number from ${MIN_SCRATCH_GIB} to ${MAX_SCRATCH_GIB}`;
  return e;
}

export const checkWorkers = (text: string): AppError | undefined => {
  const w = whole(text);
  return w === undefined || w > MAX_WORKERS
    ? invalid({ workers: `Enter a whole number from 0 to ${MAX_WORKERS}` })
    : undefined;
};

/** What the pools table shows for a pool's reconcile state and its pause switch. */
export function poolStateWord(p: PoolRecord): "Paused" | "Deleting" | "Enabled" {
  return p.state === "paused" ? "Paused" : p.state === "deleting" ? "Deleting" : "Enabled";
}

/** A pool whose template was retired (disabled) after the pool was created (WEB-US-22.3). */
export function templateRetired(
  p: { template: string },
  templates: readonly AgentTemplateRecord[],
): boolean {
  const t = templates.find((x) => x.name === p.template);
  return t !== undefined && !t.enabled;
}

/** Stages ordered by position, then name. */
export const orderStages = (s: readonly StageRecord[]): StageRecord[] =>
  [...s].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

export interface PoolCreateResult {
  readonly pool: PoolRecord;
  /** Parts the API refused after the pool existed (handoffs, secret bindings, configuration values). */
  readonly failures: readonly { readonly part: string; readonly message: string }[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : "Not saved");

export interface SharedRoleResult {
  readonly created: readonly PoolRoleLinkRecord[];
  readonly failed: readonly { readonly accountId: string; readonly message: string }[];
}

/** Pools and stages of an ephemeral team (M5-P). The API decides access and the 50-stage and 200-worker limits. */
export class PoolsUseCases {
  constructor(
    private readonly port: PoolsPort,
    private readonly agents: Pick<AgentsPort, "list" | "templates">,
    private readonly reports: Pick<ReportsPort, "run"> | undefined = undefined,
  ) {}

  stages(teamId: string, signal?: AbortSignal) {
    return this.port.listStages(teamId, signal).then(orderStages);
  }
  createStage(teamId: string, name: string, position: number, description?: string) {
    const f: Record<string, string> = {};
    if (!/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/.test(name))
      f.name = "Use 3 to 40 lower-case letters, digits and hyphens";
    if (!Number.isInteger(position) || position < 1 || position > MAX_STAGE_POSITION)
      f.position = `Enter a position from 1 to ${MAX_STAGE_POSITION}`;
    if (Object.keys(f).length > 0) return Promise.reject(invalid(f));
    return this.port.createStage(teamId, { name, position, ...(description && { description }) });
  }
  moveStage(teamId: string, s: StageRecord, position: number) {
    if (!Number.isInteger(position) || position < 1 || position > MAX_STAGE_POSITION)
      return Promise.reject(
        invalid({ position: `Enter a position from 1 to ${MAX_STAGE_POSITION}` }),
      );
    return this.port.updateStage(teamId, { id: s.id, version: s.version }, { position });
  }
  deleteStage(teamId: string, s: StageRecord) {
    return this.port.deleteStage(teamId, { id: s.id, version: s.version });
  }

  list(teamId: string, signal?: AbortSignal) {
    return this.port.list(teamId, signal);
  }
  status(teamId: string, poolId: string, signal?: AbortSignal) {
    return this.port.status(teamId, poolId, signal);
  }
  /** Worker counts by what each pool reports; a pool whose status cannot be read is left out. */
  async statuses(
    teamId: string,
    poolIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, PoolStatusRecord>>> {
    const out: Record<string, PoolStatusRecord> = {};
    await Promise.all(
      poolIds.map(async (id) => {
        try {
          out[id] = await this.port.status(teamId, id, signal);
        } catch {
          /* shown as no counts */
        }
      }),
    );
    return out;
  }
  /** The role links of several pools, by pool id (one read per pool, like T8 for agents). */
  async linksFor(
    teamId: string,
    poolIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, readonly PoolRoleLinkRecord[]>>> {
    const out: Record<string, readonly PoolRoleLinkRecord[]> = {};
    await Promise.all(
      poolIds.map(async (id) => {
        try {
          out[id] = await this.port.roleLinks(teamId, id, signal);
        } catch {
          out[id] = [];
        }
      }),
    );
    return out;
  }
  templates(signal?: AbortSignal) {
    return this.agents.templates(signal);
  }

  /** Names an agent or a pool of the team already uses. */
  async takenNames(teamId: string, signal?: AbortSignal): Promise<string[]> {
    const [a, p] = await Promise.all([
      this.agents.list(teamId, signal),
      this.port.list(teamId, signal),
    ]);
    return [...a.map((x) => x.name), ...p.map((x) => x.name)];
  }

  /** Month-to-date spend by pool from the usage report; the report names the pool in `pool` (CQ-23). */
  async spendByPool(
    teamId: string,
    signal?: AbortSignal,
  ): Promise<Readonly<Record<string, string>>> {
    if (!this.reports) return {};
    const r = await this.reports.run(
      { level: "team", teamId },
      "usage",
      { range: "mtd", groupBy: ["pool"] },
      signal,
    );
    const out: Record<string, string> = {};
    for (const row of r.rows) {
      const id = row.pool ?? row.poolId;
      const cost = row.costUsd ?? row.estimatedUsd;
      if (typeof id === "string" && typeof cost === "string") out[id] = cost;
    }
    return out;
  }

  /**
   * *Create pool*: `CreatePool`, then handoffs, secret bindings and configuration values, which the create
   * request does not carry. A part the API refuses is reported while the pool stays created.
   */
  async create(
    teamId: string,
    d: PoolDraft,
    opts: { taken?: readonly string[]; namespace?: readonly string[] } = {},
  ): Promise<PoolCreateResult> {
    const errors = validatePool(d, opts.taken ?? [], opts.namespace ?? []);
    if (Object.keys(errors).length > 0) throw invalid(errors);
    const input: CreatePoolInput = {
      name: d.name.trim(),
      template: d.template,
      image: d.image.trim(),
      models: toModelsBody({
        access: d.modelAccess,
        modelIds: d.modelIds,
        defaultModelId: d.defaultModelId,
      }),
      workers: Number(d.workers),
      scratchSizeGiB: Number(d.scratchSizeGiB),
      sharedVolume: d.sharedVolume,
      stageId: d.stageId === "" ? null : d.stageId,
      ...(d.persona.trim() && { persona: d.persona.trim() }),
      ...((d.cpu || d.memory) && {
        resources: { ...(d.cpu && { cpu: d.cpu }), ...(d.memory && { memory: d.memory }) },
      }),
    };
    const pool = await this.port.create(teamId, input);
    const failures: { part: string; message: string }[] = [];
    let version = pool.version;
    const attempt = async (part: string, f: () => Promise<unknown>) => {
      try {
        await f();
      } catch (e) {
        failures.push({ part, message: msg(e) });
      }
    };
    if (d.handoffs.length > 0)
      await attempt("handoffs", async () => {
        const h = await this.port.putHandoffs(teamId, { id: pool.id, version }, d.handoffs);
        version = h.version ?? version;
      });
    if (d.bindings.length > 0)
      await attempt("secret bindings", async () => {
        const cur = await this.port.secretBindings(teamId, pool.id);
        await this.port.putSecretBindings(
          teamId,
          { id: pool.id, version: cur.version ?? version },
          d.bindings.map((b) => ({
            secretId: b.secretId,
            delivery: b.delivery,
            target: b.target.trim(),
          })),
        );
      });
    for (const c of d.config)
      await attempt(`configuration value ${c.name}`, () =>
        this.port.putConfigValue(teamId, pool.id, {
          name: c.name.trim(),
          source: c.source,
          ...(c.source === "literal" && { value: c.value }),
        }),
      );
    return { pool, failures };
  }

  scale(teamId: string, pool: PoolRecord, workers: string) {
    const bad = checkWorkers(workers);
    return bad ? Promise.reject(bad) : this.port.scale(teamId, pool.id, Number(workers));
  }
  pause(teamId: string, pool: PoolRecord) {
    return this.port.pause(teamId, pool.id);
  }
  resume(teamId: string, pool: PoolRecord) {
    return this.port.resume(teamId, pool.id);
  }
  delete(teamId: string, pool: PoolRecord) {
    return this.port.delete(teamId, { id: pool.id, version: pool.version });
  }

  handoffs(teamId: string, poolId: string, signal?: AbortSignal) {
    return this.port.handoffs(teamId, poolId, signal);
  }
  saveHandoffs(teamId: string, pool: PoolRecord, to: readonly string[]) {
    if (to.includes(pool.id))
      return Promise.reject(invalid({ toPoolIds: "A pool cannot hand off to itself" }));
    return this.port.putHandoffs(teamId, { id: pool.id, version: pool.version }, to);
  }

  roleLinks(teamId: string, poolId: string, signal?: AbortSignal) {
    return this.port.roleLinks(teamId, poolId, signal);
  }
  /**
   * *Shared named role* (WEB-US-39.4): one role name linked in each chosen account, every account inside the
   * team's allowed accounts. Accounts already linked under that role name are skipped.
   */
  async linkSharedRole(
    teamId: string,
    poolId: string,
    roleName: string,
    accountIds: readonly string[],
    allowed: readonly string[],
    existing: readonly PoolRoleLinkRecord[] = [],
  ): Promise<SharedRoleResult> {
    const f: Record<string, string> = {};
    if (!IAM_ROLE_NAME.test(roleName))
      f.roleName = "Use up to 64 letters, digits and + = , . @ _ -";
    if (accountIds.length === 0) f.accounts = "Choose at least one account";
    else if (accountIds.some((a) => !allowed.includes(a)))
      f.accounts = "Choose accounts the team's filter allows";
    if (Object.keys(f).length > 0) throw invalid(f);
    const have = new Set(existing.filter((l) => l.roleName === roleName).map((l) => l.accountId));
    const created: PoolRoleLinkRecord[] = [];
    const failed: { accountId: string; message: string }[] = [];
    for (const accountId of accountIds) {
      if (have.has(accountId)) continue;
      try {
        created.push(
          await this.port.createRoleLink(teamId, poolId, {
            accountId,
            roleName,
            profileName: roleName,
          }),
        );
      } catch (e) {
        failed.push({ accountId, message: msg(e) });
      }
    }
    return { created, failed };
  }
  verifyLink(teamId: string, poolId: string, linkId: string) {
    return this.port.verifyRoleLink(teamId, poolId, linkId);
  }
  deleteLink(teamId: string, poolId: string, l: PoolRoleLinkRecord) {
    return this.port.deleteRoleLink(teamId, poolId, { id: l.id, version: l.version });
  }
}
