import { describe, expect, it } from "vitest";
import { SdkReports } from "./reports.js";
import { fakeApi, json, on } from "./testing.js";

const report = {
  kind: "usage",
  groupBy: ["agent"],
  range: { from: "a", to: "b" },
  rows: [{ agent: "a1", calls: 2 }],
  totals: { calls: 2 },
  notes: ["note"],
};
const csv = (text: string, headers: Record<string, string> = {}) =>
  new Response(text, { headers: { "content-type": "text/csv", ...headers } });

describe("SdkReports (M3-R)", () => {
  it("runs team, agent and service reports with the query and keeps the notes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/reports/usage", () => json(report)),
      on("GET", "/v1/teams/t1/agents/a1/reports/activity", () => json(report)),
      on("GET", "/v1/reports/costs", () => json(report)),
    );
    const p = new SdkReports(client);
    const r = await p.run({ level: "team", teamId: "t1" }, "usage", {
      range: "7d",
      groupBy: ["agent", "day"],
      modelId: "m1",
    });
    expect(r.notes).toEqual(["note"]);
    expect(calls[0]?.query.get("groupBy")).toBe("agent,day");
    expect(calls[0]?.query.get("modelId")).toBe("m1");
    await p.run({ level: "agent", teamId: "t1", agentId: "a1" }, "activity", {});
    await p.run({ level: "service" }, "costs", { from: "2026-11-01T00:00:00Z" });
    expect(calls.map((c) => c.path)).toEqual([
      "/v1/teams/t1/reports/usage",
      "/v1/teams/t1/agents/a1/reports/activity",
      "/v1/reports/costs",
    ]);
  });
  it("downloads the CSV across pages byte for byte", async () => {
    const { client } = fakeApi(
      on("GET", "/v1/reports/usage", (req) =>
        req.query.get("nextToken")
          ? csv("h\r\n2\r\n")
          : csv("h\r\n1\r\n", { "X-Afs-Next-Token": "p2" }),
      ),
    );
    expect(await new SdkReports(client).csv({ level: "service" }, "usage", { range: "30d" })).toBe(
      "h\r\n1\r\n2\r\n",
    );
  });
  it("lists reconciliations by status and maps a refusal", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/admin/cost-reconciliations", () =>
        json({
          items: [
            {
              teamId: "t1",
              day: "2026-11-20",
              gatewayUsd: "1.00",
              billedUsd: "1.10",
              variancePct: "10.00",
              status: "over_threshold",
              reconciledAt: "x",
            },
          ],
        }),
      ),
      on("GET", "/v1/reports/traffic", () =>
        json({ code: "AccessDenied", message: "no", requestId: "r" }, 403),
      ),
    );
    const p = new SdkReports(client);
    expect((await p.reconciliations("over_threshold"))[0]?.variancePct).toBe("10.00");
    expect(calls[0]?.query.get("status")).toBe("over_threshold");
    await expect(p.run({ level: "service" }, "traffic", {})).rejects.toMatchObject({
      kind: "access-denied",
    });
  });
});
