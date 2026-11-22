import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const PAGE_DEFAULT = 50;

/** 27 audit events, newest first: ids 27..1, one hour apart, alternating actors, actions and outcomes. */
const events: Json[] = Array.from({ length: 27 }, (_, i) => {
  const id = 27 - i;
  const outcomes = ["allowed", "allowed", "denied", "failed"] as const;
  return {
    id,
    occurredAt: new Date(Date.UTC(2026, 10, 21, 18, 0, 0) - i * 3_600_000)
      .toISOString()
      .replace(".000Z", "Z"),
    actorType: "user",
    actorId: id % 2 === 0 ? "usr_svc-admin" : "usr_team-admin",
    action: id % 3 === 0 ? "teams.suspend" : id % 3 === 1 ? "agents.create" : "members.add",
    outcome: outcomes[id % 4],
    resourceKind: id % 3 === 1 ? "agent" : "team",
    resourceId: id % 3 === 1 ? `agt_${String(id).padStart(3, "0")}` : TEAMS[0].id,
    requestId: `req_audit_${String(id).padStart(3, "0")}`,
  };
});

const KEYS = ["actorId", "action", "outcome", "resourceKind", "resourceId"] as const;

const revisions: Json[] = [
  [
    "team",
    TEAMS[0].id,
    4,
    "UPDATE",
    "usr_team-admin",
    "2026-11-21T16:00:00Z",
    { displayName: "Payments", costCenter: "CC-100", maxBudgetUsd: "6000.00" },
  ],
  [
    "team",
    TEAMS[0].id,
    3,
    "UPDATE",
    "usr_svc-admin",
    "2026-11-20T12:00:00Z",
    { displayName: "Payments", costCenter: "CC-100", maxBudgetUsd: "5000.00" },
  ],
  [
    "team",
    TEAMS[0].id,
    2,
    "UPDATE",
    "usr_svc-admin",
    "2026-11-19T09:00:00Z",
    { displayName: "Payments Team", maxBudgetUsd: "5000.00" },
  ],
  [
    "agent",
    "agt_001",
    1,
    "INSERT",
    "usr_team-admin",
    "2026-11-18T09:00:00Z",
    { name: "reviewer", modelId: "anthropic.claude-sonnet-4-5" },
  ],
].map(([resourceKind, resourceId, revision, operation, changedBy, changedAt, snapshot]) => ({
  resourceKind,
  resourceId,
  revision,
  operation,
  changedBy,
  changedAt,
  snapshot,
}));

const notFound = (what: string) => ({
  status: 404,
  body: { code: "NotFound", message: `${what} not found`, requestId: "req_fake_nf" },
});

/** Audit events with filters and paging, and config revisions (M1-H). The CSV form is intercepted by the spec. */
export const historyFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/audit-events",
    response: ({ params, query }) => {
      if (params.teamId !== TEAMS[0].id) return { status: 200, body: { items: [] } };
      const from = query.get("from");
      const to = query.get("to");
      const matching = events
        .filter((e) => KEYS.every((k) => !query.get(k) || e[k] === query.get(k)))
        .filter((e) => !from || String(e.occurredAt) >= from)
        .filter((e) => !to || String(e.occurredAt) <= to);
      const size = Number(query.get("maxResults") ?? PAGE_DEFAULT);
      const start = Number(query.get("nextToken") ?? 0);
      const items = matching.slice(start, start + size);
      const more = start + size < matching.length;
      return { status: 200, body: { items, ...(more ? { nextToken: String(start + size) } : {}) } };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/revisions",
    response: ({ params, query }) => {
      if (params.teamId !== TEAMS[0].id) return { status: 200, body: { items: [] } };
      const items = revisions
        .filter((r) => !query.get("resourceKind") || r.resourceKind === query.get("resourceKind"))
        .filter((r) => !query.get("resourceId") || r.resourceId === query.get("resourceId"))
        .map(({ snapshot: _s, ...rest }) => rest);
      return { status: 200, body: { items } };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/revisions/{rev}",
    response: ({ params }) => {
      const r = revisions.find((x) => String(x.revision) === params.rev);
      return r ? { status: 200, body: r } : notFound("Revision");
    },
  },
];
