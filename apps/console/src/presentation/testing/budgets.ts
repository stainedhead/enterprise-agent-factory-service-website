import { type Mock, vi } from "vitest";
import type { BudgetRecord, BudgetsPort } from "../../application/ports/budgets.js";
import { BudgetsUseCases } from "../../application/usecases/budgets/BudgetsUseCases.js";

export const aBudget = (over: Partial<BudgetRecord> = {}): BudgetRecord => ({
  amountUsd: "1000.00",
  spentUsd: "820.00",
  reservedUsd: "5.00",
  period: "monthly",
  onExhaust: "block",
  thresholds: [50, 80, 100],
  percentUsed: 82,
  forecastUsd: "1180.00",
  projectedCapAt: "2026-11-27T00:00:00Z",
  version: 4,
  ...over,
});

export type FakeBudgetsPort = { [K in keyof BudgetsPort]: Mock<BudgetsPort[K]> };

export function fakeBudgetsPort(over: Partial<BudgetsPort> = {}): FakeBudgetsPort {
  return {
    get: vi.fn(async () => aBudget()),
    put: vi.fn(async (_t: string, version: number) => aBudget({ version: version + 1 })),
    costs: vi.fn(async () => [
      { day: "2026-11-01", source: "gateway", costUsd: "10.00" },
      { day: "2026-11-01", source: "cur_eks", costUsd: "2.00" },
      { day: "2026-11-02", source: "gateway", costUsd: "12.00" },
      { day: "2026-11-02", source: "cur_bedrock", costUsd: "12.10" },
    ]),
    usageByAgent: vi.fn(async () => [
      {
        agentId: "agt_1",
        calls: 10,
        inputTokens: 410_000_000,
        outputTokens: 91_000_000,
        costUsd: "12.98",
      },
      { agentId: "agt_2", calls: 5, costUsd: "9.41" },
    ]),
    usageCsv: vi.fn(async () => "agent,calls\r\nagt_1,10\r\n"),
    ...over,
  } as unknown as FakeBudgetsPort;
}

const clock = {
  now: () => Date.parse("2026-11-03T10:00:00Z"),
  setTimeout: () => 0,
  clearTimeout: () => {},
};
export const budgetsServices = (p: BudgetsPort) => ({ budgets: new BudgetsUseCases(p, clock) });
