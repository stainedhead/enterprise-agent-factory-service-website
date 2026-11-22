import { describe, expect, it, vi } from "vitest";
import type { ReportData, ReportsPort } from "../../ports/reports.js";
import { ReportsUseCases } from "./ReportsUseCases.js";
import {
  bytes,
  bytesOf,
  chartOf,
  columnsOf,
  costOf,
  duration,
  idleSeconds,
  num,
  summarizeActivity,
  unmeteredSystems,
  utilizationPct,
} from "./reportView.js";

const NOW = Date.parse("2026-11-22T10:00:00Z");
const data = (over: Partial<ReportData> = {}): ReportData => ({
  kind: "costs",
  range: { from: "2026-11-01T00:00:00Z", to: "2026-11-22T00:00:00Z" },
  groupBy: ["day", "model"],
  rows: [
    { day: "2026-11-01", model: "opus", estimatedUsd: "10.00", calls: 3 },
    { day: "2026-11-01", model: "haiku", estimatedUsd: "2.50" },
    { day: "2026-11-02", model: "opus", estimatedUsd: "4.00" },
  ],
  totals: { estimatedUsd: "16.50" },
  notes: ["Spend with providers other than Bedrock is not included"],
  ...over,
});
function make(d: ReportData = data()) {
  const port: ReportsPort = {
    run: vi.fn(async () => d),
    csv: vi.fn(async () => "a,b\r\n1,2\r\n"),
    reconciliations: vi.fn(async () => []),
  };
  return { port, uc: new ReportsUseCases(port, { now: () => NOW }) };
}

describe("report reading (M3-R, CQ-16)", () => {
  it("reads the cost measure by its documented names", () => {
    expect(costOf({ estimatedUsd: "1.00", costUsd: "2.00" })).toBe("1.00");
    expect(costOf({ costUsd: "2.00" })).toBe("2.00");
    expect(costOf({ billedUsd: "3.00" })).toBe("3.00");
    expect(costOf({ calls: 1 })).toBeUndefined();
    expect(num({ a: "4", b: "x" }, "b", "a")).toBe(4);
  });
  it("formats durations and bytes", () => {
    expect(duration(11400)).toBe("3 h 10 min");
    expect(duration(30)).toBe("1 min");
    expect(duration(0)).toBe("—");
    expect(bytes(1536)).toBe("1.5 KiB");
    expect(bytes(12)).toBe("12 B");
    expect(bytes(undefined)).toBe("—");
  });
  it("builds a stacked series per second group over the days", () => {
    const c = chartOf(data());
    expect(c?.kind).toBe("stacked");
    expect(c?.categories).toEqual(["2026-11-01", "2026-11-02"]);
    expect(c?.series.find((s) => s.id === "opus")?.values).toEqual([10, 4]);
    expect(c?.series.find((s) => s.id === "haiku")?.values).toEqual([2.5, null]);
  });
  it("builds one bar per group when not grouped by time, and plots calls when there is no cost", () => {
    const c = chartOf(
      data({
        groupBy: ["model"],
        rows: [
          { model: "a", calls: 3 },
          { model: "b", calls: 5 },
        ],
      }),
    );
    expect(c?.measure).toBe("calls");
    expect(c?.series[0]?.values).toEqual([3, 5]);
    expect(chartOf(data({ rows: [{ day: "x", note: "n" }] }))).toBeUndefined();
  });
  it("traffic never shows a cost column", () => {
    const d = data({
      kind: "traffic",
      groupBy: ["system"],
      rows: [{ system: "github", connections: 4, bytes: 10, estimatedUsd: "1.00" }],
    });
    expect(columnsOf(d, "traffic")).toEqual(["system", "connections", "bytes"]);
    expect(columnsOf(d, "costs")).toContain("estimatedUsd");
  });
  it("summarizes activity: states, mean utilization, longest idle", () => {
    const rows = [
      { agent: "a", state: "working", utilization: 0.78 },
      { agent: "b", state: "idle", utilization: 44, idleSince: "2026-11-22T06:50:00Z" },
      { agent: "c", state: "idle", utilization: 0.22, idleSeconds: 100 },
      { agent: "d", state: "paused", utilization: 0 },
      { agent: "e", state: "budget_blocked" },
    ];
    const s = summarizeActivity(rows, NOW);
    expect(s).toMatchObject({ working: 1, idle: 2, paused: 1, other: 1, utilizationPct: 36 });
    expect(s.longestIdleSeconds).toBe(11400);
    expect(utilizationPct({ utilization: 0.5 })).toBe(50);
    expect(idleSeconds({}, NOW)).toBeUndefined();
  });
  it("reads the documented time-in-state measures and bytes in and out", () => {
    const rows = [
      { agent: "a", workingSeconds: 900, idleSeconds: 100, utilizationPct: 90 },
      { agent: "b", workingSeconds: 10, idleSeconds: 500, utilizationPct: 2 },
      { agent: "c", offSeconds: 86400 },
      { agent: "d", impairedSeconds: 60 },
      { agent: "e" },
    ];
    expect(summarizeActivity(rows, NOW)).toMatchObject({
      working: 1,
      idle: 1,
      paused: 1,
      other: 2,
      utilizationPct: 46,
      longestIdleSeconds: 500,
    });
    expect(bytesOf({ bytesOut: 10, bytesIn: 5 })).toBe(15);
    expect(bytesOf({ bytes: 7 })).toBe(7);
    expect(bytesOf({})).toBeUndefined();
  });
  it("lists unmetered systems from the rows", () => {
    expect(unmeteredSystems([{ system: "openai", unmetered: true }, { system: "github" }])).toEqual(
      ["openai"],
    );
  });
});

describe("ReportsUseCases (M3-R1..R3)", () => {
  it("runs a report and keeps the API's notes", async () => {
    const { uc, port } = make();
    const v = await uc.run({ level: "team", teamId: "t1" }, "costs", {
      range: "mtd",
      groupBy: ["day", "model"],
    });
    expect(v.notes).toEqual(["Spend with providers other than Bedrock is not included"]);
    expect(v.chart?.categories).toHaveLength(2);
    expect(port.run).toHaveBeenCalledWith(
      { level: "team", teamId: "t1" },
      "costs",
      { range: "mtd", groupBy: ["day", "model"] },
      undefined,
    );
  });
  it("downloads exactly what the API returned for the same query", async () => {
    const { uc, port } = make();
    const q = { range: "7d", groupBy: ["agent"] };
    const f = await uc.csv({ level: "service" }, "usage", q);
    expect(f.text).toBe("a,b\r\n1,2\r\n");
    expect(f.filename).toBe("usage-report-service.csv");
    expect(port.csv).toHaveBeenCalledWith({ level: "service" }, "usage", q, undefined);
  });
  it("refuses a backwards custom range before calling the API", async () => {
    const { uc, port } = make();
    const e = await uc
      .run({ level: "service" }, "usage", {
        from: "2026-11-10T00:00:00Z",
        to: "2026-11-01T00:00:00Z",
      })
      .catch((x) => x);
    expect(e.fields.to).toMatch(/before the start/);
    expect(port.run).not.toHaveBeenCalled();
    await expect(
      uc.csv({ level: "service" }, "usage", {
        from: "2026-11-10T00:00:00Z",
        to: "2026-11-01T00:00:00Z",
      }),
    ).rejects.toBeTruthy();
  });
  it("activity runs carry a summary", async () => {
    const { uc } = make(
      data({
        kind: "activity",
        groupBy: ["agent"],
        rows: [{ agent: "a", state: "working", utilization: 0.5 }],
      }),
    );
    const v = await uc.run({ level: "team", teamId: "t1" }, "activity", {});
    expect(v.activity?.working).toBe(1);
    expect(v.chart).toBeUndefined();
  });
  it("summarizes one agent from usage and activity reports", async () => {
    const port: ReportsPort = {
      run: vi.fn(async (_s, kind) =>
        kind === "usage"
          ? data({
              kind: "usage",
              groupBy: [],
              rows: [],
              totals: { estimatedUsd: "9.00", calls: 7, inputTokens: 100, outputTokens: 50 },
            })
          : data({
              kind: "activity",
              groupBy: [],
              rows: [{ state: "idle", utilization: 0.4, idleSeconds: 3600 }],
              totals: {},
            }),
      ),
      csv: vi.fn(),
      reconciliations: vi.fn(async () => []),
    };
    const s = await new ReportsUseCases(port, { now: () => NOW }).agentSummary("t1", "a1", {
      range: "30d",
    });
    expect(s).toMatchObject({ costUsd: "9.00", calls: 7, inputTokens: 100, state: "idle" });
    expect(s.activity?.utilizationPct).toBe(40);
    expect(s.activity?.longestIdleSeconds).toBe(3600);
  });
});
