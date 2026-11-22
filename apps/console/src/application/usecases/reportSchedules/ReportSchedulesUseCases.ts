import { AppError } from "../../errors.js";
import type {
  ReportScheduleRecord,
  ReportSchedulesPort,
  ScheduleInput,
} from "../../ports/reportSchedules.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** Report schedules for T11 (M4-S). The API decides access and which channels a team may use. */
export class ReportSchedulesUseCases {
  constructor(private readonly port: ReportSchedulesPort) {}

  list(teamId: string, signal?: AbortSignal) {
    return this.port.list(teamId, signal);
  }
  create(teamId: string, input: ScheduleInput) {
    if (!input.name.trim()) return Promise.reject(invalid("name", "Enter a name"));
    if (!input.channelId)
      return Promise.reject(invalid("channelId", "Choose a channel to deliver to"));
    return this.port.create(teamId, input);
  }
  setEnabled(teamId: string, s: ReportScheduleRecord, enabled: boolean) {
    return this.port.update(teamId, { id: s.id, version: s.version }, { enabled });
  }
  delete(teamId: string, s: ReportScheduleRecord) {
    return this.port.delete(teamId, { id: s.id, version: s.version });
  }
}
