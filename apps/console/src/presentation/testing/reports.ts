import { type Mock, vi } from "vitest";
import type { ReportData, ReportsPort } from "../../application/ports/reports.js";
import { ReportsUseCases } from "../../application/usecases/reports/ReportsUseCases.js";

export const aReport = (over: Partial<ReportData> = {}): ReportData => ({
  kind: "usage",
  range: { from: "2026-11-01T00:00:00Z", to: "2026-11-03T00:00:00Z" },
  groupBy: ["model"],
  rows: [
    {
      model: "claude-sonnet",
      calls: 10,
      inputTokens: 1000,
      outputTokens: 500,
      estimatedUsd: "12.50",
    },
    {
      model: "claude-haiku",
      calls: 40,
      inputTokens: 4000,
      outputTokens: 900,
      estimatedUsd: "3.25",
    },
  ],
  totals: { calls: 50, inputTokens: 5000, outputTokens: 1400, estimatedUsd: "15.75" },
  notes: [],
  ...over,
});

export type FakeReportsPort = { [K in keyof ReportsPort]: Mock<ReportsPort[K]> };

export function fakeReportsPort(over: Partial<ReportsPort> = {}): FakeReportsPort {
  return {
    run: vi.fn(async () => aReport()),
    csv: vi.fn(async () => "model,calls\r\nclaude-sonnet,10\r\n"),
    reconciliations: vi.fn(async () => [
      {
        teamId: "team_1",
        day: "2026-11-20",
        gatewayUsd: "25.35",
        billedUsd: "27.10",
        variancePct: "6.90",
        status: "over_threshold",
        reconciledAt: "2026-11-21T18:00:00Z",
      },
    ]),
    ...over,
  } as unknown as FakeReportsPort;
}

const clock = { now: () => Date.parse("2026-11-03T10:00:00Z") };
export const reportsServices = (p: ReportsPort) => ({ reports: new ReportsUseCases(p, clock) });
