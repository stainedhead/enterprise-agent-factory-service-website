import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

/** 30 service audit events across two teams, newest first, with denied and drift-corrected ones. */
const events: Json[] = Array.from({ length: 30 }, (_, i) => {
  const id = 30 - i;
  const outcomes = ["allowed", "allowed", "denied", "failed"] as const;
  const outcome = outcomes[id % 4];
  const drift = id % 10 === 0;
  return {
    id,
    occurredAt: new Date(Date.UTC(2026, 10, 21, 18, 0, 0) - i * 3_600_000)
      .toISOString()
      .replace(".000Z", "Z"),
    actorType: drift ? "system" : "user",
    actorId: drift ? "afs-reconciler" : id % 2 === 0 ? "usr_svc-admin" : "usr_team-admin",
    action: drift ? "drift.corrected" : id % 3 === 0 ? "teams.suspend" : "agents.create",
    outcome: drift ? "allowed" : outcome,
    resourceKind: drift ? "agent" : id % 3 === 0 ? "team" : "agent",
    resourceId: drift || id % 3 !== 0 ? `agt_${String(id).padStart(3, "0")}` : TEAMS[0].id,
    teamId: TEAMS[id % 2]?.id,
    requestId: `req_svc_${String(id).padStart(3, "0")}`,
    ...(!drift && outcome === "denied" ? { after: { requiredPermission: "teams:write" } } : {}),
  };
});

const KEYS = ["actorId", "action", "outcome", "resourceKind", "resourceId", "teamId"] as const;

/** The service audit log with filters, paging and a CSV form (M4-A). */
export const adminAuditFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/admin/audit-events",
    response: ({ query }) => {
      const from = query.get("from");
      const to = query.get("to");
      const matching = events
        .filter((e) => KEYS.every((k) => !query.get(k) || e[k] === query.get(k)))
        .filter((e) => !from || String(e.occurredAt) >= from)
        .filter((e) => !to || String(e.occurredAt) <= to);
      const size = Number(query.get("maxResults") ?? 50);
      const start = Number(query.get("nextToken") ?? 0);
      const more = start + size < matching.length;
      return {
        status: 200,
        body: {
          items: matching.slice(start, start + size),
          ...(more ? { nextToken: String(start + size) } : {}),
        },
        csv: `id,teamId,action,outcome\n${matching.map((e) => `${e.id},${e.teamId},${e.action},${e.outcome}`).join("\n")}\n`,
      };
    },
  },
];
