import { type Mock, vi } from "vitest";
import type {
  AdminAgentTemplatesPort,
  AdminStorageClassesPort,
} from "../../application/ports/adminCatalogs.js";
import {
  AdminAgentTemplatesUseCases,
  AdminStorageClassesUseCases,
} from "../../application/usecases/adminCatalogs/AdminCatalogsUseCases.js";
import { aStorageClass, aTemplate } from "./agents.js";

export const D1 = `sha256:${"a".repeat(64)}`;
export const D2 = `sha256:${"b".repeat(64)}`;

export type FakeStoragePort = {
  [K in keyof AdminStorageClassesPort]: Mock<AdminStorageClassesPort[K]>;
};
export type FakeTemplatesPort = {
  [K in keyof AdminAgentTemplatesPort]: Mock<AdminAgentTemplatesPort[K]>;
};

export function fakeStoragePort(over: Partial<AdminStorageClassesPort> = {}): FakeStoragePort {
  return {
    list: vi.fn(async () => [aStorageClass(), aStorageClass({ name: "io2", volumeType: "io2" })]),
    put: vi.fn(async () => aStorageClass()),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeStoragePort;
}

export function fakeTemplatesPort(over: Partial<AdminAgentTemplatesPort> = {}): FakeTemplatesPort {
  return {
    list: vi.fn(async () => [
      aTemplate({ name: "coder", currentDigest: D1, allowedDigests: [D1, D2] }),
      aTemplate({ name: "legacy", enabled: false, currentDigest: D2, allowedDigests: [D2] }),
    ]),
    put: vi.fn(async () => aTemplate()),
    delete: vi.fn(async () => undefined),
    ...over,
  } as unknown as FakeTemplatesPort;
}

export const adminCatalogsServices = (s: AdminStorageClassesPort, t: AdminAgentTemplatesPort) => ({
  adminStorageClasses: new AdminStorageClassesUseCases(s),
  adminAgentTemplates: new AdminAgentTemplatesUseCases(t),
});
