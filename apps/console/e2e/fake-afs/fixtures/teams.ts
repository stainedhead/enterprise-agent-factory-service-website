import { team as coreTeam, TEAMS } from "./core.js";
import type { Fixture, FixtureContext } from "./index.js";

type Json = Record<string, unknown>;

const ts = "2026-11-21T18:00:00Z";
const status = (phase: string, observedGeneration = 1) => ({
  conditions: [],
  observedGeneration,
  phase,
  updatedAt: ts,
});

interface Entry {
  body: Json;
  /** Reads of this team since it was created: a new team is Reconciling on the first read, Ready after. */
  reads: number;
  newTeam: boolean;
}

let teams = new Map<string, Entry>();
let seq = 0;

function seed(): void {
  teams = new Map();
  seq = 0;
  TEAMS.forEach((t, i) => {
    teams.set(t.id, {
      reads: 0,
      newTeam: false,
      body: {
        ...coreTeam(t),
        costCenter: i === 0 ? "CC-100" : "CC-200",
        maxBudgetUsd: i === 0 ? "5000.00" : "8000.00",
      },
    });
  });
}
seed();

/** Back to the two seeded teams (called by the fake server's reset). */
export const resetTeams = seed;

/** The current body of a team, for fixtures of other areas that follow a team's guardrails. */
export const teamBody = (id: string): Json | undefined => teams.get(id)?.body;

const view = (e: Entry): Json => {
  if (e.newTeam) {
    e.reads++;
    return { ...e.body, status: status(e.reads <= 1 ? "Reconciling" : "Ready") };
  }
  if (e.body.state === "deleting") {
    e.reads++;
    if (e.reads > 1) e.body = { ...e.body, state: "deleted" };
  }
  return e.body;
};

const notFound = (id: string) => ({
  status: 404,
  body: { code: "NotFound", message: `Team ${id} not found`, requestId: "req_fake_nf" },
});

const visibleTo = (ctx: FixtureContext): Entry[] =>
  [...teams.values()].filter((e) => ctx.principal?.id === "svc-admin" || e.body.id === TEAMS[0].id);

export const teamsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams",
    response: (ctx) => {
      const state = ctx.query.get("state");
      const kind = ctx.query.get("kind");
      const items = visibleTo(ctx)
        .filter((e) => !state || e.body.state === state)
        .filter((e) => !kind || e.body.kind === kind)
        .map(view);
      return { status: 200, body: { items } };
    },
  },
  {
    method: "POST",
    path: "/v1/teams",
    response: ({ body }) => {
      const b = body as Json;
      const id = `team_01JD2Q3R4S5T6V7W8X9Y0Z9${String(++seq).padStart(3, "0")}`;
      const created: Json = {
        ...coreTeam({ id, slug: String(b.slug), displayName: String(b.displayName) } as never),
        kind: b.kind ?? "persistent",
        maxBudgetUsd: b.maxBudgetUsd,
        effectiveCeilingUsd: b.maxBudgetUsd,
        ...(b.costCenter ? { costCenter: b.costCenter } : {}),
        status: status("Pending"),
        generation: 1,
      };
      teams.set(id, { body: created, reads: 0, newTeam: true });
      return { status: 201, body: created };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}",
    response: ({ params }) => {
      const e = teams.get(params.teamId ?? "");
      return e ? { status: 200, body: view(e) } : notFound(params.teamId ?? "");
    },
  },
  {
    method: "PATCH",
    path: "/v1/teams/{teamId}",
    response: ({ params, body }) => {
      const e = teams.get(params.teamId ?? "");
      if (!e) return notFound(params.teamId ?? "");
      const patch = { ...(body as Json) };
      delete patch.ceilingOverrideReason;
      const next: Json = { ...e.body, ...patch, version: Number(e.body.version) + 1 };
      if (patch.ceilingOverrideUsd) next.effectiveCeilingUsd = patch.ceilingOverrideUsd;
      else if (patch.maxBudgetUsd) next.effectiveCeilingUsd = patch.maxBudgetUsd;
      if (patch.maxBudgetUsd && Number(patch.maxBudgetUsd) < Number(e.body.maxBudgetUsd))
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "The ceiling cannot be below the budget",
            requestId: "req_fake_val",
            details: {
              fields: [
                {
                  field: "maxBudgetUsd",
                  message: `Must be at least ${e.body.maxBudgetUsd}`,
                  reason: "below_budget",
                },
              ],
            },
          },
        };
      e.body = next;
      return { status: 200, body: next };
    },
  },
  {
    method: "DELETE",
    path: "/v1/teams/{teamId}",
    response: ({ params }) => {
      const e = teams.get(params.teamId ?? "");
      if (!e) return notFound(params.teamId ?? "");
      e.body = { ...e.body, state: "deleting", version: Number(e.body.version) + 1 };
      e.reads = 0;
      return { status: 202, body: e.body };
    },
  },
  ...(["suspend", "resume"] as const).map(
    (verb): Fixture => ({
      method: "POST",
      path: `/v1/teams/{teamId}:${verb}`,
      response: ({ params }) => {
        const e = teams.get(params.teamId ?? "");
        if (!e) return notFound(params.teamId ?? "");
        e.body = {
          ...e.body,
          state: verb === "suspend" ? "suspended" : "active",
          version: Number(e.body.version) + 1,
        };
        return { status: 200, body: e.body };
      },
    }),
  ),
  {
    method: "GET",
    path: "/v1/teams/{teamId}/status",
    response: ({ params }) => {
      const e = teams.get(params.teamId ?? "");
      if (!e) return notFound(params.teamId ?? "");
      const v = view(e);
      return {
        status: 200,
        body: { id: v.id, kind: "team", generation: v.generation, status: v.status },
      };
    },
  },
  {
    method: "GET",
    path: "/v1/models",
    response: {
      status: 200,
      body: {
        items: [
          {
            id: "anthropic.claude-sonnet-4-5",
            displayName: "Claude Sonnet 4.5",
            provider: "anthropic",
            enabled: true,
            contextWindow: 200000,
            maxOutputTokens: 8192,
          },
          {
            id: "anthropic.claude-haiku-4-5",
            displayName: "Claude Haiku 4.5",
            provider: "anthropic",
            enabled: true,
            contextWindow: 200000,
            maxOutputTokens: 8192,
          },
        ],
      },
    },
  },
  {
    method: "GET",
    path: "/v1/admin/service-tags",
    response: {
      status: 200,
      body: {
        items: [
          {
            key: "environment",
            mode: "required",
            allowedValues: ["prod", "staging", "dev"],
            description: "Deployment environment",
          },
        ],
      },
    },
  },
  {
    method: "GET",
    path: "/v1/reports/{kind}",
    response: {
      status: 200,
      body: {
        groupBy: ["team"],
        kind: "usage",
        notes: [],
        range: { from: "2026-11-01T00:00:00Z", to: ts },
        rows: [
          { team: TEAMS[0].id, costUsd: "3120.50", calls: 1200 },
          { team: TEAMS[1].id, costUsd: "6500.00", calls: 3100 },
        ],
        totals: { costUsd: "9620.50", calls: 4300 },
      },
    },
  },
];
