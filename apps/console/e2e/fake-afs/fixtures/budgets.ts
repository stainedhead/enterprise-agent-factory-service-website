import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";
import { teamBody } from "./teams.js";

type Json = Record<string, unknown>;

const seed = (teamId: string): Json => ({
  id: `bud_${teamId}`,
  period: "monthly",
  amountUsd: "5000.00",
  spentUsd: "4100.00",
  reservedUsd: "50.00",
  thresholds: [50, 80, 100],
  onExhaust: "block",
  percentUsed: 82,
  forecastUsd: "5600.00",
  projectedCapAt: "2026-11-27T00:00:00Z",
  version: 1,
});
let budgets = new Map<string, Json>();
export const resetBudgets = (): void => {
  budgets = new Map(TEAMS.map((t) => [t.id, seed(t.id)]));
};
resetBudgets();
export const budgetOf = (teamId: string): Json | undefined => budgets.get(teamId);

const days = (): string[] =>
  Array.from({ length: 21 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);

/** The month so far: gateway spend daily, EKS compute daily, billed Bedrock until the 20th. */
const costRows = (): Json[] =>
  days().flatMap((day, i) => [
    { day, source: "gateway", costUsd: (150 + ((i * 37) % 90)).toFixed(2), calls: 100 + i },
    { day, source: "cur_eks", costUsd: (20 + (i % 5)).toFixed(2) },
    ...(i < 20
      ? [{ day, source: "cur_bedrock", costUsd: (151 + ((i * 37) % 90)).toFixed(2) }]
      : []),
  ]);

export const budgetsFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/v1/teams/{teamId}/budget",
    response: ({ params }) => {
      const b = budgets.get(params.teamId ?? "");
      return b
        ? { status: 200, body: b }
        : {
            status: 404,
            body: { code: "NotFound", message: "Budget not found", requestId: "req_fake_nf" },
          };
    },
  },
  {
    method: "PUT",
    path: "/v1/teams/{teamId}/budget",
    response: ({ params, body }) => {
      const id = params.teamId ?? "";
      const cur = budgets.get(id);
      const patch = body as Json;
      const ceiling = String(teamBody(id)?.effectiveCeilingUsd ?? "0");
      if (Number(patch.amountUsd) > Number(ceiling))
        return {
          status: 400,
          body: {
            code: "ValidationError",
            message: "The amount is above the ceiling",
            requestId: "req_fake_val",
            details: { fields: [{ field: "amountUsd", message: `Must be at most ${ceiling}` }] },
          },
        };
      const next = { ...(cur ?? seed(id)), ...patch, version: Number(cur?.version ?? 0) + 1 };
      budgets.set(id, next);
      return { status: 200, body: next };
    },
  },
  {
    method: "GET",
    path: "/v1/teams/{teamId}/costs",
    response: () => ({ status: 200, body: { items: costRows() } }),
  },
];
