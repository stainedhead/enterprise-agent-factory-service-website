import { type Mock, vi } from "vitest";
import type { AdminNotificationChannelsPort } from "../../application/ports/adminNotificationChannels.js";
import { AdminNotificationChannelsUseCases } from "../../application/usecases/adminNotificationChannels/AdminNotificationChannelsUseCases.js";
import { aChannel } from "./notifications.js";

export type FakeAdminNotificationChannelsPort = {
  [K in keyof AdminNotificationChannelsPort]: Mock<AdminNotificationChannelsPort[K]>;
};

export function fakeAdminNotificationChannelsPort(
  over: Partial<AdminNotificationChannelsPort> = {},
): FakeAdminNotificationChannelsPort {
  return {
    list: vi.fn(async () => [
      aChannel({
        id: "nch_9",
        name: "ops-email",
        kind: "email",
        config: { to: "ops@example.test" },
        secretId: undefined,
      }),
    ]),
    create: vi.fn(async () => aChannel()),
    update: vi.fn(async () => aChannel()),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeAdminNotificationChannelsPort;
}

export const adminNotificationChannelsServices = (p: AdminNotificationChannelsPort) => ({
  adminNotificationChannels: new AdminNotificationChannelsUseCases(p),
});
