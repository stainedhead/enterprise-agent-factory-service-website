import { TEAMS } from "./core.js";
import type { Fixture } from "./index.js";

/** Readiness and the two lists the dashboard banner counts (M1-D3). */
export const dashboardFixtures: readonly Fixture[] = [
  {
    method: "GET",
    path: "/readyz",
    response: { status: 200, body: { status: "ok", checks: { database: "ok", reconciler: "ok" } } },
  },
  {
    method: "GET",
    path: "/v1/admin/cost-reconciliations",
    response: ({ query }) => ({
      status: 200,
      body: {
        items:
          query.get("status") === "over_threshold"
            ? [
                {
                  teamId: TEAMS[1].id,
                  day: "2026-11-20",
                  gatewayUsd: "100.00",
                  billedUsd: "112.00",
                  variancePct: "12.0",
                  status: "over_threshold",
                  reconciledAt: "2026-11-21T04:00:00Z",
                },
              ]
            : [],
      },
    }),
  },
  {
    method: "GET",
    path: "/v1/admin/model-price-proposals",
    response: ({ query }) => ({
      status: 200,
      body: {
        items:
          query.get("status") === "pending"
            ? [
                {
                  id: "mpp_01JD2Q3R4S5T6V7W8X9Y0Z0001",
                  modelId: "anthropic.claude-sonnet-4-5",
                  effectiveFrom: "2026-12-01T00:00:00Z",
                  inputUsdPerMtok: "3.00",
                  outputUsdPerMtok: "15.00",
                  status: "pending",
                  fetchedAt: "2026-11-21T00:00:00Z",
                  version: 1,
                },
              ]
            : [],
      },
    }),
  },
];
