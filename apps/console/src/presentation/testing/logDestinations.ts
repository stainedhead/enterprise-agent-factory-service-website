import { type Mock, vi } from "vitest";
import type {
  LogDestinationFull,
  LogDestinationsPort,
} from "../../application/ports/logDestinations.js";
import { LogDestinationsUseCases } from "../../application/usecases/logDestinations/LogDestinationsUseCases.js";

export const aLogDestination = (over: Partial<LogDestinationFull> = {}): LogDestinationFull => ({
  id: "log_1",
  name: "central",
  kind: "cloudwatch",
  enabled: true,
  config: { logGroup: "/afs/payments", region: "eu-west-1" },
  secretId: undefined,
  phase: "Ready",
  delivery: "healthy",
  deliveryMessage: undefined,
  deliveryAt: "2026-11-21T10:00:00Z",
  version: 3,
  ...over,
});

export type FakeLogDestinationsPort = {
  [K in keyof LogDestinationsPort]: Mock<LogDestinationsPort[K]>;
};

export function fakeLogDestinationsPort(
  over: Partial<LogDestinationsPort> = {},
): FakeLogDestinationsPort {
  return {
    list: vi.fn(async () => [aLogDestination()]),
    create: vi.fn(async () => aLogDestination()),
    update: vi.fn(async () => aLogDestination()),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeLogDestinationsPort;
}

export const logDestinationsServices = (p: LogDestinationsPort) => ({
  logDestinations: new LogDestinationsUseCases(p),
});
