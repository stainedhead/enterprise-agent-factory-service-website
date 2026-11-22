import { describe, expect, it } from "vitest";
import { SdkReportSchedules } from "./reportSchedules.js";
import { fakeApi, json, on } from "./testing.js";

const wire = {
  id: "rs_1",
  name: "Weekly spend",
  report: "costs",
  cadence: "weekly",
  channelId: "nch_1",
  enabled: true,
  format: "csv",
  query: {},
  nextRunAt: "2026-11-29T06:00:00Z",
  lastRunAt: "2026-11-22T06:00:00Z",
  lastStatus: "failed",
  lastError: "HTTP 401 from the webhook",
  version: 2,
};

describe("SdkReportSchedules (M4-S1)", () => {
  it("lists with run status, creates with the stored query, toggles with If-Match and deletes", async () => {
    const { client, calls } = fakeApi(
      on("GET", "/v1/teams/t1/report-schedules", () => json({ items: [wire] })),
      on("POST", "/v1/teams/t1/report-schedules", () => json(wire, 201)),
      on("PATCH", "/v1/teams/t1/report-schedules/rs_1", () => json({ ...wire, enabled: false })),
      on("DELETE", "/v1/teams/t1/report-schedules/rs_1", () => json({}, 204)),
    );
    const port = new SdkReportSchedules(client);
    const [s] = await port.list("t1");
    expect(s).toMatchObject({ lastStatus: "failed", lastError: "HTTP 401 from the webhook" });
    await port.create("t1", {
      name: "Weekly spend",
      report: "costs",
      cadence: "weekly",
      channelId: "nch_1",
      query: { range: "mtd", groupBy: ["day"], agentId: "agt_1" },
    });
    expect(calls.find((c) => c.method === "POST")?.body).toMatchObject({
      format: "csv",
      query: { range: "mtd", groupBy: ["day"], filters: { agentId: "agt_1" } },
    });
    await port.update("t1", { id: "rs_1", version: 2 }, { enabled: false });
    expect(calls.find((c) => c.method === "PATCH")?.headers.get("if-match")).toBe('"2"');
    await port.delete("t1", { id: "rs_1", version: 2 });
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });
});
