import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../errors.js";
import type { BudgetRecord, BudgetsPort, CostLine } from "../../ports/budgets.js";
import { BudgetsUseCases, monthRange, toBudgetDraft } from "./BudgetsUseCases.js";

const NOW = Date.parse("2026-11-03T10:00:00Z");
const clock = { now: () => NOW, setTimeout: () => 0, clearTimeout: () => {} };
const budget = (over: Partial<BudgetRecord> = {}): BudgetRecord => ({
  amountUsd: "1000.00",
  spentUsd: "250.00",
  reservedUsd: "0.00",
  period: "monthly",
  onExhaust: "block",
  thresholds: [50, 80, 100],
  version: 4,
  ...over,
});
const line = (day: string, source: string, costUsd: string): CostLine => ({ day, source, costUsd });

function make(lines: CostLine[] = [], b = budget()) {
  const port: BudgetsPort = {
    get: vi.fn(async () => b),
    put: vi.fn(async () => b),
    costs: vi.fn(async () => lines),
    usageByAgent: vi.fn(async () => [
      { agentId: "a1", calls: 1, costUsd: "5.00" },
      { agentId: "a2", calls: 2, costUsd: "9.00" },
    ]),
    usageCsv: vi.fn(async () => "agent,calls\r\n"),
  };
  return { port, uc: new BudgetsUseCases(port, clock) };
}

describe("BudgetsUseCases overview (M3-B1)", () => {
  it("reads the month so far and splits daily spend into Bedrock tokens and EKS compute", async () => {
    const { uc, port } = make([
      line("2026-11-01", "gateway", "10.00"),
      line("2026-11-01", "gateway", "2.50"),
      line("2026-11-02", "gateway", "4.00"),
      line("2026-11-02", "cur_eks", "1.25"),
      line("2026-11-02", "cur_bedrock", "4.10"),
    ]);
    const o = await uc.overview("t1");
    expect(o.days).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(o.bedrock).toEqual([12.5, 4, null]);
    expect(o.eks).toEqual([null, 1.25, null]);
    expect(o.bedrockUsd).toBe("16.50");
    expect(o.eksUsd).toBe("1.25");
    expect(port.costs).toHaveBeenCalledWith(
      "t1",
      { from: "2026-11-01T00:00:00Z", to: "2026-11-03T10:00:00Z" },
      undefined,
    );
  });
  it("reconciles the latest day with gateway and CUR Bedrock figures", async () => {
    const { uc } = make([
      line("2026-11-01", "gateway", "100.00"),
      line("2026-11-01", "cur_bedrock", "110.00"),
      line("2026-11-02", "gateway", "50.00"),
    ]);
    const r = (await uc.overview("t1")).reconciliation;
    expect(r).toEqual({
      day: "2026-11-01",
      gatewayUsd: "100.00",
      billedUsd: "110.00",
      variancePct: 10,
    });
  });
  it("has no reconciliation until CUR has arrived, and lists agents by cost", async () => {
    const { uc } = make([line("2026-11-01", "gateway", "1.00")]);
    const o = await uc.overview("t1");
    expect(o.reconciliation).toBeUndefined();
    expect(o.agents.map((a) => a.agentId)).toEqual(["a2", "a1"]);
    expect(o.percentUsed).toBe(25);
  });
  it("uses the API's percentUsed when present", async () => {
    const { uc } = make([], budget({ percentUsed: 82 }));
    expect((await uc.overview("t1")).percentUsed).toBe(82);
  });
  it("the month range starts at the first of the month in UTC", () => {
    expect(monthRange(Date.parse("2026-12-31T23:59:59Z")).from).toBe("2026-12-01T00:00:00Z");
  });
});

const ctx = { ceilingUsd: "5000.00", kind: "persistent" as const };
const draft = { amountUsd: "4000.00", thresholds: "50, 80", onExhaust: "block" };

describe("BudgetsUseCases save (M3-B2)", () => {
  it("sends the amount, thresholds and action with the version", async () => {
    const { uc, port } = make();
    await uc.save("t1", budget(), draft, ctx);
    expect(port.put).toHaveBeenCalledWith("t1", 4, {
      amountUsd: "4000.00",
      period: "monthly",
      thresholds: [50, 80],
      onExhaust: "block",
    });
  });
  it("refuses an amount above the ceiling, naming the ceiling, without calling the API", async () => {
    const { uc, port } = make();
    const e = await uc
      .save("t1", budget(), { ...draft, amountUsd: "5000.01" }, ctx)
      .catch((x) => x);
    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).fields.amountUsd).toContain("$5,000.00");
    expect(port.put).not.toHaveBeenCalled();
  });
  it.each([
    [{ amountUsd: "abc" }, "amountUsd"],
    [{ amountUsd: "0" }, "amountUsd"],
    [{ thresholds: "50, 150" }, "thresholds"],
  ])("refuses invalid input %j", async (patch, field) => {
    const { uc } = make();
    const e = await uc.save("t1", budget(), { ...draft, ...patch }, ctx).catch((x) => x);
    expect(Object.keys((e as AppError).fields)).toContain(field);
  });
  it("refuses notify for an ephemeral team", async () => {
    const { uc } = make();
    const e = await uc
      .save("t1", budget(), { ...draft, onExhaust: "notify" }, { ...ctx, kind: "ephemeral" })
      .catch((x) => x);
    expect((e as AppError).fields.onExhaust).toMatch(/persistent/);
  });
  it("starts a draft from the budget and builds the CSV file name", async () => {
    expect(toBudgetDraft(budget())).toEqual({
      amountUsd: "1000.00",
      thresholds: "50, 80, 100",
      onExhaust: "block",
    });
    const { uc } = make();
    expect((await uc.usageCsv("t1")).filename).toBe("usage-t1-2026-11.csv");
  });
});
