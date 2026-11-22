import { describe, expect, it, vi } from "vitest";
import type { ReportSchedulesPort } from "../../ports/reportSchedules.js";
import { ReportSchedulesUseCases } from "./ReportSchedulesUseCases.js";

const port = () => ({
  list: vi.fn(async () => []),
  create: vi.fn(async () => ({}) as never),
  update: vi.fn(async () => ({}) as never),
  delete: vi.fn(async () => undefined),
});
const input = {
  name: "Weekly",
  report: "costs",
  cadence: "weekly",
  channelId: "nch_1",
  query: {},
} as const;

describe("ReportSchedulesUseCases (M4-S1)", () => {
  it("refuses a blank name and a missing channel before any request", async () => {
    const p = port();
    const u = new ReportSchedulesUseCases(p as unknown as ReportSchedulesPort);
    await expect(u.create("t1", { ...input, name: " " })).rejects.toMatchObject({
      fields: { name: expect.any(String) },
    });
    await expect(u.create("t1", { ...input, channelId: "" })).rejects.toMatchObject({
      fields: { channelId: expect.any(String) },
    });
    expect(p.create).not.toHaveBeenCalled();
    await u.create("t1", input);
    expect(p.create).toHaveBeenCalled();
  });
  it("toggles and deletes with the version it read", async () => {
    const p = port();
    const u = new ReportSchedulesUseCases(p as unknown as ReportSchedulesPort);
    const s = { id: "rs_1", version: 4 } as never;
    await u.setEnabled("t1", s, false);
    expect(p.update).toHaveBeenCalledWith("t1", { id: "rs_1", version: 4 }, { enabled: false });
    await u.delete("t1", s);
    expect(p.delete).toHaveBeenCalledWith("t1", { id: "rs_1", version: 4 });
  });
});
