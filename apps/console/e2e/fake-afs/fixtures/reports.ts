import { TEAMS } from "./core.js";
import type { Fixture, FixtureContext } from "./index.js";

type Json = Record<string, unknown>;

const range = { from: "2026-11-01T00:00:00Z", to: "2026-11-22T10:00:00Z" };

/** A report body for one kind and grouping; traffic never carries a cost (D14). */
function report(kind: string, groupBy: readonly string[], teamId?: string): Json {
  switch (kind) {
    case "costs":
      return {
        kind,
        range,
        groupBy,
        notes: ["Billed cost for the last day has not arrived yet."],
        rows: [
          { day: "2026-11-19", estimatedUsd: "150.20", billedUsd: "151.00" },
          { day: "2026-11-20", estimatedUsd: "162.40", billedUsd: "161.90" },
          { day: "2026-11-21", estimatedUsd: "171.10" },
        ],
        totals: { estimatedUsd: "483.70", billedUsd: "312.90" },
      };
    case "activity":
      return {
        kind,
        range,
        groupBy: ["agent"],
        notes: [],
        rows: [
          {
            agent: "reviewer",
            workingSeconds: 50000,
            idleSeconds: 3600,
            offSeconds: 0,
            impairedSeconds: 0,
            modelCalls: 900,
            utilizationPct: 93,
          },
          {
            agent: "triage",
            workingSeconds: 9000,
            idleSeconds: 11400,
            offSeconds: 0,
            impairedSeconds: 600,
            modelCalls: 120,
            utilizationPct: 43,
          },
          {
            agent: "docs",
            workingSeconds: 0,
            idleSeconds: 0,
            offSeconds: 86400,
            impairedSeconds: 0,
            modelCalls: 0,
            utilizationPct: 0,
          },
        ],
        totals: {},
      };
    case "traffic":
      return {
        kind,
        range,
        groupBy: ["system"],
        notes: [],
        rows: [
          {
            system: "github",
            connections: 120,
            deniedConnections: 2,
            requests: 900,
            errors: 3,
            bytesOut: 1048576,
            bytesIn: 4194304,
          },
          {
            system: "wiki",
            connections: 14,
            deniedConnections: 0,
            requests: 20,
            errors: 0,
            bytesOut: 4096,
            bytesIn: 16384,
            unmetered: true,
          },
        ],
        totals: {
          connections: 134,
          deniedConnections: 2,
          requests: 920,
          errors: 3,
          bytesOut: 1052672,
          bytesIn: 4210688,
        },
      };
    default:
      if (!teamId && groupBy.includes("team"))
        return {
          kind: "usage",
          range,
          groupBy: ["team"],
          notes: [],
          rows: [
            { team: TEAMS[0].id, costUsd: "3120.50", calls: 1200 },
            { team: TEAMS[1].id, costUsd: "6500.00", calls: 3100 },
          ],
          totals: { costUsd: "9620.50", calls: 4300 },
        };
      return {
        kind: "usage",
        range,
        groupBy: groupBy.length ? groupBy : ["model"],
        notes: [],
        rows: teamId
          ? [
              {
                model: "claude-sonnet",
                calls: 900,
                inputTokens: 410000000,
                outputTokens: 91000000,
                estimatedUsd: "312.40",
              },
              {
                model: "claude-haiku",
                calls: 4200,
                inputTokens: 120000000,
                outputTokens: 30000000,
                estimatedUsd: "41.10",
              },
            ]
          : [
              {
                model: "claude-sonnet",
                calls: 5000,
                inputTokens: 2100000000,
                outputTokens: 500000000,
                estimatedUsd: "1980.00",
              },
              {
                model: "claude-haiku",
                calls: 9000,
                inputTokens: 900000000,
                outputTokens: 200000000,
                estimatedUsd: "240.50",
              },
            ],
        totals: teamId
          ? { calls: 5100, inputTokens: 530000000, outputTokens: 121000000, estimatedUsd: "353.50" }
          : {
              calls: 14000,
              inputTokens: 3000000000,
              outputTokens: 700000000,
              estimatedUsd: "2220.50",
            },
      };
  }
}

const groups = (ctx: FixtureContext): string[] =>
  (ctx.query.get("groupBy") ?? "").split(",").filter(Boolean);

const known = (teamId: string | undefined): boolean =>
  teamId === undefined || TEAMS.some((t) => t.id === teamId);
const notFound = {
  status: 404,
  body: { code: "NotFound", message: "Not found", requestId: "req_fake_nf" },
};

/** Service, team and agent reports and the cost reconciliations of S8 (M3-R). */
export const reportsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/reports/{kind}",
    response: (ctx) =>
      ctx.principal?.id !== "svc-admin"
        ? {
            status: 403,
            body: {
              code: "AccessDenied",
              message: "Requires service_admin",
              requestId: "req_fake_403",
            },
          }
        : { status: 200, body: report(ctx.params.kind ?? "usage", groups(ctx)) },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/reports/{kind}",
    response: (ctx) =>
      known(ctx.params.teamId)
        ? { status: 200, body: report(ctx.params.kind ?? "usage", groups(ctx), ctx.params.teamId) }
        : notFound,
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/agents/{agentId}/reports/{kind}",
    response: (ctx) =>
      known(ctx.params.teamId)
        ? { status: 200, body: report(ctx.params.kind ?? "usage", groups(ctx), ctx.params.teamId) }
        : notFound,
  },
  {
    method: "GET",
    path: "/v1/admin/cost-reconciliations",
    response: (ctx) => {
      const all = [
        {
          teamId: TEAMS[0].id,
          day: "2026-11-20",
          gatewayUsd: "25.35",
          billedUsd: "27.10",
          variancePct: "6.90",
          status: "over_threshold",
          reconciledAt: "2026-11-21T18:00:00Z",
        },
        {
          teamId: TEAMS[1].id,
          day: "2026-11-20",
          gatewayUsd: "40.00",
          billedUsd: "40.10",
          variancePct: "0.25",
          status: "ok",
          reconciledAt: "2026-11-21T18:00:00Z",
        },
        {
          teamId: TEAMS[1].id,
          day: "2026-11-21",
          gatewayUsd: "38.00",
          billedUsd: "0.00",
          variancePct: "-100.00",
          status: "missing_billing",
          reconciledAt: "2026-11-22T06:00:00Z",
        },
      ];
      const s = ctx.query.get("status");
      return { status: 200, body: { items: s ? all.filter((r) => r.status === s) : all } };
    },
  },
];
