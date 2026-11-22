import { type Mock, vi } from "vitest";
import type { ChannelRecord, NotificationsPort } from "../../application/ports/notifications.js";
import { NotificationsUseCases } from "../../application/usecases/notifications/NotificationsUseCases.js";

export const aChannel = (over: Partial<ChannelRecord> = {}): ChannelRecord => ({
  id: "nch_1",
  name: "alerts",
  kind: "slack",
  enabled: true,
  eventTypes: ["budget.*"],
  config: { channel: "#alerts" },
  secretId: "sec_1",
  delivery: {
    healthy: true,
    lastDeliveredAt: "2026-11-20T10:00:00Z",
    lastFailureAt: undefined,
    lastError: undefined,
    lastTestId: undefined,
  },
  version: 3,
  ...over,
});

export type FakeNotificationsPort = { [K in keyof NotificationsPort]: Mock<NotificationsPort[K]> };

export function fakeNotificationsPort(
  over: Partial<NotificationsPort> = {},
): FakeNotificationsPort {
  return {
    list: vi.fn(async () => [aChannel()]),
    get: vi.fn(async () => aChannel()),
    create: vi.fn(async () => aChannel()),
    update: vi.fn(async () => aChannel()),
    delete: vi.fn(async () => undefined),
    test: vi.fn(async () => ({ testId: "t1", delivered: true, pending: false, error: undefined })),
    schedules: vi.fn(async () => []),
    ...over,
  } as unknown as FakeNotificationsPort;
}

const clock = {
  setTimeout: (fn: () => void) => {
    fn();
    return 0;
  },
};
export const notificationsServices = (p: NotificationsPort) => ({
  notifications: new NotificationsUseCases(p, clock),
});
