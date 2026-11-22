import { describe, expect, it, vi } from "vitest";
import type { AdminExportsPort, ExportRecord } from "../../ports/adminExports.js";
import {
  AdminExportsUseCases,
  downloadState,
  inputHash,
  isRunning,
  MAX_BUNDLE_BYTES,
  parseAccountMap,
} from "./AdminExportsUseCases.js";

const e = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  id: "exp_1",
  status: "succeeded",
  teamIds: [],
  createdAt: "2026-11-20T10:00:00Z",
  finishedAt: undefined,
  sizeBytes: 1,
  sha256: "x",
  downloadUrl: "https://dl.example.test/x",
  downloadExpiresAt: "2026-11-27T10:00:00Z",
  error: undefined,
  ...over,
});
const NOW = Date.parse("2026-11-22T00:00:00Z");

const port = () => ({
  list: vi.fn(async () => []),
  create: vi.fn(async () => e()),
  get: vi.fn(async () => e()),
  importBundle: vi.fn(async (_i: unknown, dryRun: boolean) => ({ dryRun, teams: [] })),
});
const uc = () => {
  const p = port();
  return { p, u: new AdminExportsUseCases(p as unknown as AdminExportsPort) };
};

describe("export download state (M4-E1)", () => {
  it("offers the link for 7 days, then shows it expired", () => {
    expect(downloadState(e(), NOW)).toBe("ready");
    expect(downloadState(e({ downloadExpiresAt: "2026-11-21T00:00:00Z" }), NOW)).toBe("expired");
    expect(downloadState(e({ downloadUrl: undefined }), NOW)).toBe("expired");
    expect(downloadState(e({ status: "running" }), NOW)).toBe("pending");
    expect(downloadState(e({ status: "failed" }), NOW)).toBe("failed");
    expect(isRunning(e({ status: "pending" }))).toBe(true);
    expect(isRunning(e())).toBe(false);
  });
});

describe("import inputs (M4-E2)", () => {
  it("parses the account map and refuses a malformed pair", () => {
    expect(parseAccountMap("111122223333=444455556666\n777788889999 -> 000011112222")).toEqual({
      "111122223333": "444455556666",
      "777788889999": "000011112222",
    });
    expect(parseAccountMap("")).toEqual({});
    expect(() => parseAccountMap("1=2")).toThrow(/not <source/);
  });
  it("hashes the same inputs the same way and different inputs differently", () => {
    expect(inputHash("{}", { a: "b" })).toBe(inputHash("{}", { a: "b" }));
    expect(inputHash("{}", { a: "b" })).not.toBe(inputHash("{ }", { a: "b" }));
    expect(inputHash("{}", { a: "b" })).not.toBe(inputHash("{}", { a: "c" }));
  });
  it("refuses a bundle over 100 MB, invalid JSON and a non-object before any request", () => {
    const { p, u } = uc();
    expect(() => u.prepare({ size: MAX_BUNDLE_BYTES + 1, text: "{}" }, "")).toThrow(/100 MB/);
    expect(() => u.prepare({ size: 3, text: "nope" }, "")).toThrow(/valid JSON/);
    expect(() => u.prepare({ size: 2, text: "[]" }, "")).toThrow(/not an export bundle/);
    expect(p.importBundle).not.toHaveBeenCalled();
  });
  it("applies only the inputs that were dry-run", async () => {
    const { p, u } = uc();
    const prepared = u.prepare({ size: 2, text: "{}" }, "");
    await expect(u.apply(prepared, undefined)).rejects.toMatchObject({
      fields: { bundle: expect.any(String) },
    });
    await expect(u.apply(prepared, "other")).rejects.toBeTruthy();
    expect(p.importBundle).not.toHaveBeenCalled();
    await u.dryRun(prepared);
    expect(p.importBundle).toHaveBeenLastCalledWith(prepared.input, true);
    await u.apply(prepared, prepared.hash);
    expect(p.importBundle).toHaveBeenLastCalledWith(prepared.input, false);
  });
});
