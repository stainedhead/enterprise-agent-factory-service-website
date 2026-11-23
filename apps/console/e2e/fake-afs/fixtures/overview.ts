import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

type Json = Record<string, unknown>;

const MODELS: Json[] = [
  ["anthropic.claude-sonnet-4-5", "Claude Sonnet 4.5"],
  ["anthropic.claude-haiku-4-5", "Claude Haiku 4.5"],
].map(([id, displayName]) => ({
  id,
  displayName,
  provider: "anthropic",
  enabled: true,
  contextWindow: 200000,
  maxOutputTokens: 8192,
}));

let teamModels: string[] = [];
let teamAccess: "all" | "selected" = "selected";
const teamModelsBody = (): Json => ({
  access: teamAccess,
  modelIds: teamModels,
  items: MODELS.filter((m) => teamAccess === "all" || teamModels.includes(String(m.id))),
});
export const resetOverview = (): void => {
  teamModels = ["anthropic.claude-sonnet-4-5"];
  teamAccess = "selected";
};
resetOverview();

const only = (id: string | undefined) =>
  id === TEAMS[0].id ? null : { status: 200, body: { items: [] } };

export const overviewFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/budget",
    response: ({ params }) => ({
      status: 200,
      body: {
        id: `bud_${params.teamId}`,
        period: "monthly",
        amountUsd: "5000.00",
        spentUsd: "4100.00",
        reservedUsd: "50.00",
        thresholds: [50, 80, 100],
        onExhaust: "block",
        percentUsed: 82,
        version: 1,
      },
    }),
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/work-orders",
    response: ({ params }) =>
      only(params.teamId) ?? {
        status: 200,
        body: {
          items: [
            {
              id: "wo_01JD2Q3R4S5T6V7W8X9Y0Z0001",
              kind: "cve_remediation",
              severity: "high",
              title: "Patch openssl in payments services",
              source: "api",
              templateId: "tpl_cve",
              budgetUsd: "20.00",
              slaDueAt: "2026-11-25T10:00:00Z",
              status: "in_progress",
              slaState: "on_track",
              progress: {
                repos: 4,
                prsOpen: 1,
                prsMerged: 2,
                notAffected: 0,
                failedOrSkipped: 0,
                remaining: 1,
              },
              teamId: params.teamId,
              version: 1,
            },
          ],
        },
      },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/models",
    response: () => ({ status: 200, body: teamModelsBody() }),
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/models",
    response: ({ body }) => {
      const b = body as { access?: "all" | "selected"; modelIds?: string[] };
      teamAccess = b.access ?? "selected";
      if (teamAccess === "selected") teamModels = [...(b.modelIds ?? [])];
      return { status: 200, body: teamModelsBody() };
    },
  },
];
