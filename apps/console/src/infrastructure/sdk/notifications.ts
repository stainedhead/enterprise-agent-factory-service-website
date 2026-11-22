import { type AfsClient, notificationChannels, reports } from "@afs/sdk";
import type {
  ChannelInput,
  ChannelPatch,
  ChannelRecord,
  NotificationsPort,
  ScheduleRef,
  TestResult,
} from "../../application/ports/notifications.js";
import { toAppError } from "./errors.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

type Wire = Awaited<ReturnType<ReturnType<typeof notificationChannels>["get"]>>;

const toRecord = (c: Wire): ChannelRecord => ({
  id: c.id,
  name: c.name,
  kind: c.kind,
  enabled: c.enabled ?? true,
  eventTypes: c.eventTypes ?? [],
  config: c.config ?? {},
  secretId: c.secretId ?? undefined,
  delivery: {
    healthy: c.delivery?.healthy ?? undefined,
    lastDeliveredAt: c.delivery?.lastDeliveredAt ?? undefined,
    lastFailureAt: c.delivery?.lastFailureAt ?? undefined,
    lastError: c.delivery?.lastError ?? undefined,
    lastTestId: c.delivery?.lastTestId ?? undefined,
  },
  version: c.version,
});

/** `notificationChannels.*` and `reports.schedules.list` mapped to {@link NotificationsPort}. */
export class SdkNotifications implements NotificationsPort {
  constructor(private readonly client: AfsClient) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly ChannelRecord[]> {
    return wrap(async () => {
      const out: ChannelRecord[] = [];
      for await (const c of notificationChannels(this.client).list(teamId, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(toRecord(c));
      return out;
    });
  }
  get(teamId: string, id: string, signal?: AbortSignal): Promise<ChannelRecord> {
    return wrap(async () =>
      toRecord(await notificationChannels(this.client).get(teamId, id, sig(signal))),
    );
  }
  create(teamId: string, input: ChannelInput): Promise<ChannelRecord> {
    return wrap(async () =>
      toRecord(
        await notificationChannels(this.client).create(teamId, {
          name: input.name,
          kind: input.kind,
          eventTypes: [...input.eventTypes],
          config: { ...input.config },
          ...(input.secretId && { secretId: input.secretId }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
        }),
      ),
    );
  }
  update(
    teamId: string,
    ref: { id: string; version: number },
    patch: ChannelPatch,
  ): Promise<ChannelRecord> {
    return wrap(async () =>
      toRecord(
        await notificationChannels(this.client).update(teamId, ref, {
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.enabled !== undefined && { enabled: patch.enabled }),
          ...(patch.eventTypes && { eventTypes: [...patch.eventTypes] }),
          ...(patch.config && { config: { ...patch.config } }),
          ...(patch.secretId !== undefined && { secretId: patch.secretId }),
        }),
      ),
    );
  }
  delete(teamId: string, ref: { id: string; version: number }): Promise<void> {
    return wrap(async () => {
      await notificationChannels(this.client).delete(teamId, ref);
    });
  }
  test(teamId: string, id: string): Promise<TestResult> {
    return wrap(async () => {
      const r = await notificationChannels(this.client).test(teamId, id);
      return {
        testId: r.testId,
        delivered: r.delivered,
        pending: r.pending === true,
        error: r.error ?? undefined,
      };
    });
  }
  schedules(teamId: string, signal?: AbortSignal): Promise<readonly ScheduleRef[]> {
    return wrap(async () => {
      const out: ScheduleRef[] = [];
      for await (const s of reports(this.client).schedules.list(teamId, {
        maxResults: 100,
        ...sig(signal),
      }))
        out.push({ id: s.id, name: s.name, channelId: s.channelId });
      return out;
    });
  }
}
