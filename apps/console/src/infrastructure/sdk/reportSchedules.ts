import { type AfsClient, reports } from "@afs/sdk";
import type {
  ReportScheduleRecord,
  ReportSchedulesPort,
  ScheduleInput,
} from "../../application/ports/reportSchedules.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof reports>["schedules"]["create"]>>;

const toRecord = (s: Wire): ReportScheduleRecord => ({
  id: s.id,
  name: s.name,
  report: s.report,
  cadence: s.cadence,
  channelId: s.channelId,
  enabled: s.enabled,
  nextRunAt: s.nextRunAt ?? undefined,
  lastRunAt: s.lastRunAt ?? undefined,
  lastStatus: s.lastStatus ?? undefined,
  lastError: s.lastError ?? undefined,
  version: s.version,
});

/** The schedule's stored query: the contract's `filters` map holds the entity filters. */
const toWireQuery = (q: ScheduleInput["query"]) => {
  const filters: Record<string, string> = {};
  for (const k of ["teamId", "agentId", "modelId", "systemId", "poolId"] as const) {
    const v = q[k];
    if (v) filters[k] = v;
  }
  return {
    ...(q.range && { range: q.range }),
    ...(q.from && { from: q.from }),
    ...(q.to && { to: q.to }),
    ...(q.groupBy && q.groupBy.length > 0 && { groupBy: [...q.groupBy] }),
    ...(Object.keys(filters).length > 0 && { filters }),
  };
};

/** `reports.schedules.*` mapped to {@link ReportSchedulesPort}. */
export class SdkReportSchedules implements ReportSchedulesPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly ReportScheduleRecord[]> {
    return wrap(async () => {
      const out: ReportScheduleRecord[] = [];
      for await (const s of reports(this.client).schedules.list(teamId, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(toRecord(s));
      return out;
    });
  }
  create(teamId: string, input: ScheduleInput): Promise<ReportScheduleRecord> {
    return wrap(async () =>
      toRecord(
        await reports(this.client).schedules.create(teamId, {
          name: input.name,
          report: input.report,
          cadence: input.cadence,
          channelId: input.channelId,
          format: "csv",
          query: toWireQuery(input.query),
        }),
      ),
    );
  }
  update(
    teamId: string,
    ref: { id: string; version: number },
    patch: { enabled?: boolean },
  ): Promise<ReportScheduleRecord> {
    return wrap(async () =>
      toRecord(await reports(this.client).schedules.update(teamId, ref, { ...patch })),
    );
  }
  delete(teamId: string, ref: { id: string; version: number }): Promise<void> {
    return wrap(async () => {
      await reports(this.client).schedules.delete(teamId, ref);
    });
  }
}
