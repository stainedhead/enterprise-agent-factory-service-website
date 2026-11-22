import { type AfsClient, adminNotificationChannels } from "@afs/sdk";
import type { AdminNotificationChannelsPort } from "../../application/ports/adminNotificationChannels.js";
import type {
  ChannelInput,
  ChannelPatch,
  ChannelRecord,
} from "../../application/ports/notifications.js";
import { toAppError } from "./errors.js";
import { toChannelRecord } from "./notifications.js";

const sig = (signal?: AbortSignal) => (signal ? { signal } : {});
const wrap = async <T>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    throw toAppError(e);
  }
};

/** `admin.notificationChannels.*` mapped to {@link AdminNotificationChannelsPort}. */
export class SdkAdminNotificationChannels implements AdminNotificationChannelsPort {
  constructor(private readonly client: AfsClient) {}

  list(signal?: AbortSignal): Promise<readonly ChannelRecord[]> {
    return wrap(async () => {
      const out: ChannelRecord[] = [];
      for await (const c of adminNotificationChannels(this.client).list({
        maxResults: 100,
        ...sig(signal),
      }))
        out.push(toChannelRecord(c));
      return out;
    });
  }
  create(input: ChannelInput): Promise<ChannelRecord> {
    return wrap(async () =>
      toChannelRecord(
        await adminNotificationChannels(this.client).create({
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
  update(ref: { id: string; version: number }, patch: ChannelPatch): Promise<ChannelRecord> {
    return wrap(async () =>
      toChannelRecord(
        await adminNotificationChannels(this.client).update(ref, {
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.enabled !== undefined && { enabled: patch.enabled }),
          ...(patch.eventTypes && { eventTypes: [...patch.eventTypes] }),
          ...(patch.config && { config: { ...patch.config } }),
          ...(patch.secretId !== undefined && { secretId: patch.secretId }),
        }),
      ),
    );
  }
  delete(ref: { id: string; version: number }): Promise<void> {
    return wrap(async () => {
      await adminNotificationChannels(this.client).delete(ref);
    });
  }
}
