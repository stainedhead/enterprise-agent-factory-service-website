import * as money from "../../../domain/money.js";
import { AppError, isAppError } from "../../errors.js";
import type {
  CreateWorkOrderInput,
  RepoInput,
  WorkOrderDetail,
  WorkOrderFilters,
  WorkOrderRecord,
  WorkOrderRepoRecord,
  WorkOrdersPort,
} from "../../ports/workOrders.js";

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const STATUSES = [
  "open",
  "assigned",
  "in_progress",
  "pr_opened",
  "done",
  "failed",
  "cancelled",
] as const;
export const SLA_STATES = ["on_track", "due_soon", "breached", "met", "missed"] as const;
const TERMINAL = new Set(["done", "failed", "cancelled"]);
export const CVE = /^CVE-[0-9]{4}-[0-9]{4,}$/;
const REPO_REF = /^([A-Za-z0-9.-]+)\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One repository line of the form: `host/owner/repo` and who owns it (none, a team, an email, or both). */
export interface RepoDraft {
  readonly ref: string;
  readonly teamId: string;
  readonly email: string;
}

export interface WorkOrderDraft {
  readonly kind: "cve_remediation" | "general";
  readonly cveId: string;
  readonly severity: string;
  readonly title: string;
  /** `datetime-local` text. */
  readonly slaDueAt: string;
  readonly templateId: string;
  readonly budgetUsd: string;
  readonly repos: readonly RepoDraft[];
}

export const emptyRepo: RepoDraft = { ref: "", teamId: "", email: "" };

/** Splits `host/owner/repo`; undefined when it is not that shape. */
export function parseRepoRef(ref: string): { host: string; repo: string } | undefined {
  const m = REPO_REF.exec(ref.trim());
  return m ? { host: m[1] as string, repo: m[2] as string } : undefined;
}

/** The repository as `host/owner/repo`. */
export const repoRef = (r: { host: string; repo: string }): string => `${r.host}/${r.repo}`;

/** The `--repos` entry the CLI takes: `host/owner/repo`, then `=team_…,ops@example.com` for an explicit owner. */
export function repoArg(r: RepoDraft): string {
  const owners = [r.teamId, r.email.trim()].filter(Boolean);
  return owners.length > 0 ? `${r.ref.trim()}=${owners.join(",")}` : r.ref.trim();
}

/** Form errors keyed `title`, `repos.0.ref`, ... Empty when the draft can be sent. */
export function validateWorkOrder(
  d: WorkOrderDraft,
  enabledTemplateIds: readonly string[],
): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.title.trim()) e.title = "Enter a title";
  else if (d.title.trim().length > 200) e.title = "Use at most 200 characters";
  if (d.kind === "cve_remediation" && !CVE.test(d.cveId.trim()))
    e.cveId = "Enter a CVE id such as CVE-2026-1234";
  if (!SEVERITIES.includes(d.severity as (typeof SEVERITIES)[number]))
    e.severity = "Choose a severity";
  if (!d.slaDueAt || Number.isNaN(Date.parse(d.slaDueAt))) e.slaDueAt = "Enter the SLA due date";
  if (!d.templateId) e.templateId = "Choose a template";
  else if (!enabledTemplateIds.includes(d.templateId)) e.templateId = "Choose an enabled template";
  if (d.budgetUsd.trim()) {
    try {
      if (money.parse(d.budgetUsd.trim()) <= 0n) e.budgetUsd = "Enter an amount above 0";
    } catch {
      e.budgetUsd = "Enter an amount such as 500.00";
    }
  }
  if (d.repos.length === 0) e.repos = "Add at least one repository";
  const seen = new Set<string>();
  d.repos.forEach((r, i) => {
    const p = parseRepoRef(r.ref);
    if (!p) e[`repos.${i}.ref`] = "Use host/owner/repo, for example github.com/acme/payments";
    else if (seen.has(repoRef(p).toLowerCase())) e[`repos.${i}.ref`] = "Listed twice";
    else seen.add(repoRef(p).toLowerCase());
    if (r.email.trim() && !EMAIL.test(r.email.trim()))
      e[`repos.${i}.email`] = "Enter a valid email address";
  });
  return e;
}

/** `datetime-local` text as an RFC 3339 instant. */
export const toInstant = (local: string): string => new Date(local).toISOString();

export function toCreateInput(d: WorkOrderDraft): CreateWorkOrderInput {
  return {
    kind: d.kind,
    ...(d.kind === "cve_remediation" && { cveId: d.cveId.trim() }),
    severity: d.severity,
    title: d.title.trim(),
    slaDueAt: toInstant(d.slaDueAt),
    templateId: d.templateId,
    ...(d.budgetUsd.trim() && { budgetUsd: money.toMoney(money.parse(d.budgetUsd.trim())) }),
    repos: d.repos.map((r): RepoInput => {
      const p = parseRepoRef(r.ref) as { host: string; repo: string };
      return {
        host: p.host,
        repo: p.repo,
        ...(r.teamId && { owningTeamId: r.teamId }),
        ...(r.email.trim() && { owningContact: r.email.trim() }),
      };
    }),
  };
}

/** What a refused create says about owners (400 `details.ambiguousRepos` and `details.unownedRepos`). */
export interface OwnerProblems {
  readonly ambiguous: ReadonlyMap<string, readonly string[]>;
  readonly unowned: ReadonlySet<string>;
}

export function ownerProblems(e: unknown): OwnerProblems | undefined {
  if (!isAppError(e) || e.kind !== "validation") return undefined;
  const amb = new Map<string, readonly string[]>();
  const a = e.details.ambiguousRepos;
  if (Array.isArray(a))
    for (const x of a as { repo?: unknown; teamIds?: unknown }[])
      if (typeof x?.repo === "string" && Array.isArray(x.teamIds))
        amb.set(
          x.repo,
          x.teamIds.filter((t): t is string => typeof t === "string"),
        );
  const un = new Set<string>();
  const u = e.details.unownedRepos;
  if (Array.isArray(u)) for (const r of u) if (typeof r === "string") un.add(r);
  return amb.size === 0 && un.size === 0 ? undefined : { ambiguous: amb, unowned: un };
}

/** A repository's owner as the detail page words it. */
export function ownerSourceLabel(source: string | undefined): string | undefined {
  if (source === "explicit") return "explicit";
  if (source === "team_config") return "team configuration";
  return undefined;
}

export const isOpen = (w: { status: string }): boolean => !TERMINAL.has(w.status);

/** Replaces the owner choices a refused create names, leaving every other line alone. */
export function prefillOwners(
  repos: readonly RepoDraft[],
  problems: OwnerProblems,
): readonly RepoDraft[] {
  return repos.map((r) => {
    const cands = problems.ambiguous.get(r.ref.trim());
    return cands && cands.length > 0 && !r.teamId ? { ...r, teamId: cands[0] as string } : r;
  });
}

const RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Most severe first, then the earliest SLA. */
export const bySeverityThenSla = (a: WorkOrderRecord, b: WorkOrderRecord): number =>
  (RANK[a.severity] ?? 9) - (RANK[b.severity] ?? 9) || a.slaDueAt.localeCompare(b.slaDueAt);

/** Repositories the team owns (`owningTeamId`), for the read-only view of a team caller (WEB-US-40.6). */
export const reposOfTeams = (
  repos: readonly WorkOrderRepoRecord[],
  teamIds: readonly string[],
): readonly WorkOrderRepoRecord[] =>
  repos.filter(
    (r) =>
      r.owningTeamId !== undefined && r.owningTeamId !== null && teamIds.includes(r.owningTeamId),
  );

/** Use cases of P3 and P6. */
export class WorkOrdersUseCases {
  constructor(private readonly port: WorkOrdersPort) {}

  list(filters: WorkOrderFilters, signal?: AbortSignal) {
    return this.port.list(filters, 200, signal).then((r) => [...r].sort(bySeverityThenSla));
  }
  get(id: string, signal?: AbortSignal) {
    return this.port.get(id, signal);
  }
  create(d: WorkOrderDraft, enabledTemplateIds: readonly string[], idempotencyKey?: string) {
    const fields = validateWorkOrder(d, enabledTemplateIds);
    if (Object.keys(fields).length > 0)
      return Promise.reject(
        new AppError({
          kind: "validation",
          message: Object.values(fields)[0] ?? "Check the form",
          fields,
        }),
      );
    return this.port.create(toCreateInput(d), idempotencyKey);
  }
  cancel(id: string, reason: string) {
    if (!reason.trim())
      return Promise.reject(
        new AppError({
          kind: "validation",
          message: "Enter a reason",
          fields: { reason: "Enter a reason" },
        }),
      );
    return this.port.cancel(id, reason.trim());
  }
  /** The open work order for `cveId`, to link from a `409` (WEB-US-40.4). */
  async openForCve(cveId: string, signal?: AbortSignal): Promise<WorkOrderRecord | undefined> {
    const all = await this.port.list({}, 200, signal);
    return all.find((w) => w.cveId === cveId && isOpen(w));
  }
  async detail(id: string, signal?: AbortSignal): Promise<WorkOrderDetail> {
    return this.port.get(id, signal);
  }
}
