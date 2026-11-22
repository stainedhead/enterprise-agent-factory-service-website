import { type Mock, vi } from "vitest";
import type { AdminExportsPort, ExportRecord } from "../../application/ports/adminExports.js";
import { AdminExportsUseCases } from "../../application/usecases/adminExports/AdminExportsUseCases.js";

export const anExport = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  id: "exp_1",
  status: "succeeded",
  teamIds: [],
  createdAt: "2026-11-20T10:00:00Z",
  finishedAt: "2026-11-20T10:01:00Z",
  sizeBytes: 2048,
  sha256: "abc123",
  downloadUrl: "https://dl.example.test/x",
  downloadExpiresAt: "2999-01-01T00:00:00Z",
  error: undefined,
  ...over,
});

export type FakeAdminExportsPort = { [K in keyof AdminExportsPort]: Mock<AdminExportsPort[K]> };

export function fakeAdminExportsPort(over: Partial<AdminExportsPort> = {}): FakeAdminExportsPort {
  return {
    list: vi.fn(async () => [anExport()]),
    create: vi.fn(async () => anExport({ status: "pending", downloadUrl: undefined })),
    get: vi.fn(async () => anExport()),
    importBundle: vi.fn(async (_i: unknown, dryRun: boolean) => ({
      dryRun,
      teams: [
        { slug: "payments", result: "updated", changes: ["agents +1"], error: undefined },
        { slug: "growth", result: "failed", changes: [], error: "Unknown model" },
      ],
    })),
    ...over,
  } as unknown as FakeAdminExportsPort;
}

export const adminExportsServices = (p: AdminExportsPort) => ({
  adminExports: new AdminExportsUseCases(p),
});
