import { describe, expect, it } from "vitest";
import { apiKey } from "../core/auth.js";
import { AfsClient } from "../core/client.js";
import { fakeFetch } from "../testing/fakeFetch.js";
import { createReports } from "./reports.js";

const body = {
  kind: "usage",
  groupBy: ["team", "day"],
  range: { from: "2026-11-14T00:00:00Z", to: "2026-11-21T00:00:00Z" },
  rows: [{ team: "team_1", day: "2026-11-20", calls: 3, estimatedUsd: "1.50" }],
  totals: { calls: 3, estimatedUsd: "1.50" },
  notes: ["Spend with providers other than Bedrock is not included"],
};

function make(f: ReturnType<typeof fakeFetch>) {
  const client = new AfsClient({
    endpoint: "https://afs.test/",
    fetch: f.fetch,
    auth: apiKey("afsk_test"),
  });
  return createReports(client);
}

describe("typed reports (M3-K1)", () => {
  it("returns typed rows, totals and notes and sends group-by lists comma-separated", async () => {
    const f = fakeFetch().on("GET /v1/teams/t1/reports/usage", { body });
    const r = await make(f).team("t1", "usage", {
      range: "7d",
      groupBy: ["team", "tag:cost-center"],
      agentId: "agt_1",
    });
    expect(r.rows[0]?.estimatedUsd).toBe("1.50");
    expect(r.totals.calls).toBe(3);
    expect(r.notes).toEqual(["Spend with providers other than Bedrock is not included"]);
    const q = f.requests[0]?.query;
    expect(q?.get("range")).toBe("7d");
    expect(q?.get("groupBy")).toBe("team,tag:cost-center");
    expect(q?.get("agentId")).toBe("agt_1");
  });
  it("agent and service reports use their own paths", async () => {
    const f = fakeFetch()
      .on("GET /v1/teams/t1/agents/a1/reports/activity", { body })
      .on("GET /v1/reports/costs", { body });
    const reports = make(f);
    await reports.agent("t1", "a1", "activity", { groupBy: "hour" });
    await reports.service("costs", { groupBy: "team" });
    expect(f.requests.map((r) => r.path)).toEqual([
      "/v1/teams/t1/agents/a1/reports/activity",
      "/v1/reports/costs",
    ]);
  });
  it("asCsv returns the body byte for byte across pages with one header row", async () => {
    const f = fakeFetch().on("GET /v1/reports/usage", (req) =>
      req.query.get("nextToken") === "p2"
        ? { text: "team,calls\r\nb,2\r\n", headers: { "Content-Type": "text/csv" } }
        : {
            text: "team,calls\r\na,1\r\n",
            headers: { "Content-Type": "text/csv", "X-Afs-Next-Token": "p2" },
          },
    );
    const csv = await make(f).service("usage", { range: "30d" }).asCsv();
    expect(csv).toBe("team,calls\r\na,1\r\nb,2\r\n");
    expect(f.requests.every((r) => r.headers.get("Accept") === "text/csv")).toBe(true);
  });
  it("is lazy: nothing is sent until awaited", () => {
    const f = fakeFetch();
    make(f).team("t1", "costs");
    expect(f.requests).toHaveLength(0);
  });
});
