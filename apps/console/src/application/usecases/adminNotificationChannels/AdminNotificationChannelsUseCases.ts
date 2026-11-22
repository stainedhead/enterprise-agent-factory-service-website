import { AppError } from "../../errors.js";
import type { AdminNotificationChannelsPort } from "../../ports/adminNotificationChannels.js";
import type { ChannelInput, ChannelPatch, ChannelRecord } from "../../ports/notifications.js";
import { checkChannel } from "../notifications/NotificationsUseCases.js";

/** The kinds a service channel can be (a team may also use EventBridge). */
export const SERVICE_CHANNEL_KINDS = ["email", "slack", "webhook", "jira"] as const;

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** Service notification channels for S10 (M4-N). The API decides access, and refuses deleting a channel in use. */
export class AdminNotificationChannelsUseCases {
  constructor(private readonly port: AdminNotificationChannelsPort) {}

  list(signal?: AbortSignal) {
    return this.port.list(signal);
  }
  create(input: ChannelInput) {
    const bad = checkChannel(input);
    return bad ? Promise.reject(bad) : this.port.create(input);
  }
  update(channel: ChannelRecord, patch: ChannelPatch) {
    if (patch.name !== undefined && !patch.name.trim())
      return Promise.reject(invalid("name", "Enter a name"));
    if (patch.eventTypes && patch.eventTypes.length === 0)
      return Promise.reject(invalid("eventTypes", "Choose at least one event"));
    return this.port.update({ id: channel.id, version: channel.version }, patch);
  }
  setEnabled(channel: ChannelRecord, enabled: boolean) {
    return this.port.update({ id: channel.id, version: channel.version }, { enabled });
  }
  delete(channel: ChannelRecord) {
    return this.port.delete({ id: channel.id, version: channel.version });
  }
}
