import { type Mock, vi } from "vitest";
import type {
  ReportScheduleRecord,
  ReportSchedulesPort,
} from "../../application/ports/reportSchedules.js";
import { ReportSchedulesUseCases } from "../../application/usecases/reportSchedules/ReportSchedulesUseCases.js";

export const aSchedule = (over: Partial<ReportScheduleRecord> = {}): ReportScheduleRecord => ({
  id: "rs_1",
  name: "Weekly spend",
  report: "costs",
  cadence: "weekly",
  channelId: "nch_1",
  enabled: true,
  nextRunAt: "2026-11-29T06:00:00Z",
  lastRunAt: "2026-11-22T06:00:00Z",
  lastStatus: "succeeded",
  lastError: undefined,
  version: 2,
  ...over,
});

export type FakeReportSchedulesPort = {
  [K in keyof ReportSchedulesPort]: Mock<ReportSchedulesPort[K]>;
};

export function fakeReportSchedulesPort(
  over: Partial<ReportSchedulesPort> = {},
): FakeReportSchedulesPort {
  return {
    list: vi.fn(async () => [aSchedule()]),
    create: vi.fn(async () => aSchedule()),
    update: vi.fn(async () => aSchedule()),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeReportSchedulesPort;
}

export const reportSchedulesServices = (p: ReportSchedulesPort) => ({
  reportSchedules: new ReportSchedulesUseCases(p),
});
