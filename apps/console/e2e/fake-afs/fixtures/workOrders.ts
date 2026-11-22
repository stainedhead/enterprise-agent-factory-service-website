import { TEAMS } from "./core.js";
import type { Fixture, FixtureContext } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const NS = "01JD2Q3R4S5T6V7W8X9Y0Z";
const TEMPLATE_IDS = [`swt_${NS}0001`] as const;
export const WORK_ORDER_IDS = [`wo_${NS}0001`, `wo_${NS}0002`, `wo_${NS}0003`] as const;

const progress = (repos: number, over: Json = {}): Json => ({
  repos,
  prsOpen: 0,
  prsMerged: 0,
  notAffected: 0,
  failedOrSkipped: 0,
  remaining: repos,
  ...over,
});
const wo = (id: string, over: Json): Json => ({
  id,
  kind: "cve_remediation",
  severity: "high",
  title: "Work order",
  source: "api",
  templateId: TEMPLATE_IDS[0],
  budgetUsd: "500.00",
  slaDueAt: "2026-11-28T18:00:00Z",
  status: "open",
  slaState: "on_track",
  progress: progress(1),
  assignedAt: null,
  completedAt: null,
  cancelReason: null,
  createdAt: ts,
  createdBy: "usr_01JD2Q3R4S5T6V7W8X9Y0Z0001",
  updatedAt: ts,
  version: 1,
  ...over,
});
const seed = (): Json[] => [
  wo(WORK_ORDER_IDS[0], {
    title: "Patch openssl in payments services",
    cveId: "CVE-2026-1234",
    severity: "critical",
    status: "in_progress",
    slaState: "due_soon",
    slaDueAt: "2026-11-25T10:00:00Z",
    teamId: TEAMS[0].id,
    progress: progress(2, { prsOpen: 1, remaining: 1 }),
    version: 3,
  }),
  wo(WORK_ORDER_IDS[1], {
    title: "Upgrade log4j in the platform",
    cveId: "CVE-2026-5555",
    severity: "medium",
    teamId: null,
    progress: progress(1),
  }),
  wo(WORK_ORDER_IDS[2], {
    title: "Rotate leaked token",
    kind: "general",
    cveId: null,
    severity: "high",
    status: "done",
    slaState: "met",
    teamId: TEAMS[1].id,
    progress: progress(1, { prsMerged: 1, remaining: 0 }),
  }),
];
const repo = (repoName: string, over: Json = {}): Json => ({
  host: "github.com",
  repo: repoName,
  status: "pending",
  owningTeamId: null,
  owningContact: null,
  prNumber: null,
  prUrl: null,
  detail: null,
  notifications: [],
  updatedAt: ts,
  version: 1,
  ...over,
});
const seedRepos = (): Map<string, Json[]> =>
  new Map([
    [
      WORK_ORDER_IDS[0],
      [
        repo("acme/payments-api", {
          status: "pr_opened",
          owningTeamId: TEAMS[0].id,
          prNumber: 7,
          prUrl: "https://github.com/acme/payments-api/pull/7",
          notifications: [{ kind: "assigned", recipient: "payments@example.com", sentAt: ts }],
        }),
        repo("acme/ledger", { owningTeamId: TEAMS[1].id, owningContact: "ledger-ops@example.com" }),
      ],
    ],
    [WORK_ORDER_IDS[1], [repo("acme/platform-core", { owningTeamId: TEAMS[1].id })]],
    [WORK_ORDER_IDS[2], [repo("acme/vault", { status: "merged", owningTeamId: TEAMS[1].id })]],
  ]);

let orders: Json[] = seed();
let repos = seedRepos();
let seq = 100;
export const resetWorkOrders = (): void => {
  orders = seed();
  repos = seedRepos();
  seq = 100;
};

/** Whether an open work order uses the template (a delete is refused while one does). */
export const openOrdersUsing = (templateId: string): boolean =>
  orders.some(
    (o) =>
      o.templateId === templateId && !["done", "failed", "cancelled"].includes(String(o.status)),
  );

const notFound = {
  status: 404,
  body: {
    code: "NotFound",
    message: "Work order not found",
    requestId: "req_fake_nf",
    details: {},
  },
};
const denied = (permission: string) => ({
  status: 403,
  body: {
    code: "AccessDenied",
    message: `Requires ${permission}`,
    requestId: "req_fake_ad",
    details: { requiredPermission: permission },
  },
});
const isOperator = (c: FixtureContext) =>
  c.principal?.id === "svc-admin" || c.principal?.id === "sec-op";
/** A team caller sees only the work orders linked to their team (`assignedOrOwnRepos`). */
const visibleTo = (c: FixtureContext, o: Json): boolean =>
  isOperator(c) ||
  o.teamId === TEAMS[0].id ||
  (repos.get(String(o.id)) ?? []).some((r) => r.owningTeamId === TEAMS[0].id);
const reposFor = (c: FixtureContext, id: string): Json[] =>
  (repos.get(id) ?? []).filter((r) => isOperator(c) || r.owningTeamId === TEAMS[0].id);
const withRepos = (c: FixtureContext, o: Json): Json => ({
  ...o,
  repos: reposFor(c, String(o.id)),
});
const slim = (o: Json): Json => {
  const { updatedAt: _u, ...rest } = o;
  return rest;
};

interface RepoIn {
  host: string;
  repo: string;
  owningTeamId?: string;
  owningContact?: string;
}
interface CreateIn {
  cveId?: string;
  repos?: RepoIn[];
  title: string;
  kind?: string;
  severity: string;
  slaDueAt: string;
  templateId: string;
  budgetUsd?: string;
}

/** Work orders (P3, P6) and the team directory they read. */
export const workOrdersFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/work-orders",
    response: (c) => {
      if (!isOperator(c)) return denied("work-orders:read");
      const q = c.query;
      const items = orders
        .filter((o) => !q.get("status") || o.status === q.get("status"))
        .filter((o) => !q.get("severity") || o.severity === q.get("severity"))
        .filter((o) => !q.get("slaState") || o.slaState === q.get("slaState"))
        .filter((o) => !q.get("teamId") || o.teamId === q.get("teamId"))
        .map(slim);
      return { status: 200, body: { items } };
    },
  },
  {
    method: "POST",
    path: "/v1/work-orders",
    response: (c) => {
      if (!isOperator(c)) return denied("work-orders:write");
      const b = c.body as CreateIn;
      const val = (message: string, details: Json) => ({
        status: 400,
        body: { code: "ValidationError", message, requestId: "req_fake_val", details },
      });
      const open = orders.find(
        (o) =>
          b.cveId &&
          o.cveId === b.cveId &&
          !["done", "failed", "cancelled"].includes(String(o.status)),
      );
      if (open)
        return {
          status: 409,
          body: {
            code: "Conflict",
            message: `${b.cveId} already has an open work order`,
            requestId: "req_fake_cf",
            details: {},
          },
        };
      const ambiguous = (b.repos ?? [])
        .filter((r) => r.repo === "acme/ambiguous" && !r.owningTeamId && !r.owningContact)
        .map((r) => ({ repo: `${r.host}/${r.repo}`, teamIds: [TEAMS[0].id, TEAMS[1].id] }));
      const unowned = (b.repos ?? [])
        .filter((r) => r.repo === "acme/orphan" && !r.owningTeamId && !r.owningContact)
        .map((r) => `${r.host}/${r.repo}`);
      if (ambiguous.length > 0 || unowned.length > 0)
        return val("Some repositories have no single owner", {
          ...(ambiguous.length > 0 && { ambiguousRepos: ambiguous }),
          ...(unowned.length > 0 && { unownedRepos: unowned }),
        });
      seq += 1;
      const id = `wo_${NS}${String(seq).padStart(4, "0")}`;
      const rs = (b.repos ?? []).map((r) =>
        repo(r.repo, {
          host: r.host,
          owningTeamId: r.owningTeamId ?? TEAMS[0].id,
          owningContact: r.owningContact ?? null,
          ownerSource: r.owningTeamId || r.owningContact ? "explicit" : "team_config",
        }),
      );
      const created = wo(id, {
        title: b.title,
        kind: b.kind ?? "general",
        cveId: b.cveId ?? null,
        severity: b.severity,
        slaDueAt: b.slaDueAt,
        templateId: b.templateId,
        budgetUsd: b.budgetUsd ?? "500.00",
        progress: progress(rs.length),
      });
      orders = [created, ...orders];
      repos.set(
        id,
        rs.map(({ ownerSource: _o, ...r }) => r),
      );
      return { status: 201, body: { ...slim(created), repos: rs } };
    },
  },
  {
    method: "GET",
    path: "/v1/work-orders/{workOrderId}",
    response: (c) => {
      const o = orders.find((x) => x.id === c.params.workOrderId);
      if (!o || !visibleTo(c, o)) return notFound;
      return { status: 200, body: withRepos(c, slim(o)), headers: { ETag: `"${o.version}"` } };
    },
  },
  {
    method: "POST",
    path: "/v1/work-orders/{workOrderId}:cancel",
    response: (c) => {
      if (!isOperator(c)) return denied("work-orders:write");
      const i = orders.findIndex((x) => x.id === c.params.workOrderId);
      const o = orders[i];
      if (!o) return notFound;
      const next = {
        ...o,
        status: "cancelled",
        cancelReason: (c.body as { reason: string }).reason,
        version: Number(o.version) + 1,
      };
      orders[i] = next;
      return { status: 200, body: slim(next) };
    },
  },
  {
    method: "GET",
    path: "/v1/work-orders/{workOrderId}/repos",
    response: (c) => {
      const o = orders.find((x) => x.id === c.params.workOrderId);
      if (!o || !visibleTo(c, o)) return notFound;
      return { status: 200, body: { items: reposFor(c, String(o.id)) } };
    },
  },
  {
    method: "GET",
    path: "/v1/team-directory",
    response: (c) =>
      isOperator(c)
        ? {
            status: 200,
            body: {
              items: TEAMS.map((t) => ({ id: t.id, slug: t.slug, displayName: t.displayName })),
            },
          }
        : denied("teams:read-directory"),
  },
];
