// The service notification channels port (M4-N, S10): `ListServiceNotificationChannels` and its create, update and
// delete. A channel is the same shape as a team's; it never carries a credential, only a secret reference.
import type { ChannelInput, ChannelPatch, ChannelRecord } from "./notifications.js";

export interface AdminNotificationChannelsPort {
  list(signal?: AbortSignal): Promise<readonly ChannelRecord[]>;
  create(input: ChannelInput): Promise<ChannelRecord>;
  update(ref: { id: string; version: number }, patch: ChannelPatch): Promise<ChannelRecord>;
  delete(ref: { id: string; version: number }): Promise<void>;
}
