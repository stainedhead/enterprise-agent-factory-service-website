// The report schedules port (M4-S): `ListReportSchedules`, `CreateReportSchedule`, `UpdateReportSchedule` and
// `DeleteReportSchedule`. A schedule delivers a CSV to one of the team's own notification channels.

import type { ReportKind, ReportQuery } from "./reports.js";

/** The kinds a schedule may deliver: the collaboration report cannot be scheduled (SDK-13). */
export type ScheduledKind = Exclude<ReportKind, "collaboration">;

export type Cadence = "daily" | "weekly" | "monthly";

export interface ReportScheduleRecord {
  readonly id: string;
  readonly name: string;
  readonly report: string;
  readonly cadence: string;
  readonly channelId: string;
  readonly enabled: boolean;
  readonly nextRunAt: string | undefined;
  readonly lastRunAt: string | undefined;
  readonly lastStatus: string | undefined;
  readonly lastError: string | undefined;
  readonly version: number;
}

export interface ScheduleInput {
  readonly name: string;
  readonly report: ScheduledKind;
  readonly cadence: Cadence;
  readonly channelId: string;
  readonly query: ReportQuery;
}

export interface ReportSchedulesPort {
  list(teamId: string, signal?: AbortSignal): Promise<readonly ReportScheduleRecord[]>;
  create(teamId: string, input: ScheduleInput): Promise<ReportScheduleRecord>;
  update(
    teamId: string,
    ref: { id: string; version: number },
    patch: { enabled?: boolean },
  ): Promise<ReportScheduleRecord>;
  delete(teamId: string, ref: { id: string; version: number }): Promise<void>;
}
