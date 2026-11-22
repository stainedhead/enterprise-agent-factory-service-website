import { describe, expect, it } from "vitest";
import { SdkDashboard } from "./dashboard.js";
import { fakeApi, json, on } from "./testing.js";

const recon = (day: string) => ({
  teamId: "team_1",
  day,
  gatewayUsd: "10.00",
  billedUsd: "12.00",
  variancePct: "20.0",
  status: "over_threshold",
  reconciledAt: "2026-11-22T00:00:00Z",
});

describe("SdkDashboard (M1-D1, M1-D3)", () => {
  it("reads readiness with its checks as strings", async () => {
    const { client } = fakeApi(
      on("GET", "/readyz", () =>
        json({ status: "ok", checks: { database: "ok", reconciler: "ok" } }),
      ),
    );
    expect(await new SdkDashboard(client).readiness()).toEqual({
      status: "ok",
      checks: { database: "ok", reconciler: "ok" },
    });
  });

  it("counts over-threshold team-days and says when there are more", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/cost-reconciliations", () =>
        json({ items: [recon("2026-11-20"), recon("2026-11-21")], nextToken: "n2" }),
      ),
    );
    expect(await new SdkDashboard(client).varianceDays()).toEqual({ count: 2, more: true });
    expect(calls[0]?.query.get("status")).toBe("over_threshold");
  });

  it("counts pending price proposals", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/model-price-proposals", () => json({ items: [] })),
    );
    expect(await new SdkDashboard(client).pendingProposals()).toEqual({ count: 0, more: false });
    expect(calls[0]?.query.get("status")).toBe("pending");
  });
});
