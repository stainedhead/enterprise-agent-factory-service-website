import { describe, expect, it } from "vitest";
import { SdkBudgets } from "./budgets.js";
import { fakeApi, json, on } from "./testing.js";

const budget = {
  id: "b",
  amountUsd: "9.00",
  spentUsd: "0.00",
  reservedUsd: "0.00",
  period: "monthly",
  onExhaust: "block",
  thresholds: [],
  version: 5,
};

describe("SdkBudgets (M3-B)", () => {
  it("reads costs across pages and usage by agent, and puts with If-Match", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/costs", (req) =>
        req.query.get("nextToken")
          ? json({ items: [{ day: "2026-11-02", source: "gateway", costUsd: "2.00" }] })
          : json({
              items: [{ day: "2026-11-01", source: "gateway", costUsd: "1.00" }],
              nextToken: "n2",
            }),
      ),
      on("GET", "/v1/teams/t1/usage", () =>
        json({
          groupBy: ["agent"],
          range: {},
          rows: [{ key: { agent: "agt_1" }, calls: 3, costUsd: "1.00", inputTokens: 5 }],
          totals: { key: {}, calls: 3, costUsd: "1.00" },
        }),
      ),
      on("PUT", "/v1/teams/t1/budget", () => json(budget)),
    );
    const port = new SdkBudgets(client);
    const range = { from: "2026-11-01T00:00:00Z", to: "2026-11-03T00:00:00Z" };
    expect((await port.costs("t1", range)).map((c) => c.day)).toEqual(["2026-11-01", "2026-11-02"]);
    const agents = await port.usageByAgent("t1", range);
    expect(agents[0]).toMatchObject({ agentId: "agt_1", calls: 3, costUsd: "1.00" });
    await port.put("t1", 4, {
      amountUsd: "9.00",
      period: "monthly",
      thresholds: [50],
      onExhaust: "block",
    });
    const put = calls.find((r) => r.method === "PUT");
    expect(put?.headers.get("If-Match")).toBe('"4"');
    expect(put?.body).toMatchObject({ amountUsd: "9.00", thresholds: [50] });
  });
  it("maps a refusal to an AppError", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/teams/t1/budget", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r" }, 403),
      ),
    );
    await expect(new SdkBudgets(client).get("t1")).rejects.toMatchObject({ kind: "access-denied" });
  });
});
