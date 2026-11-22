import { describe, expect, it } from "vitest";
import type { CostTagStatusItem } from "../../ports/adminCostTagStatus.js";
import { AdminCostTagStatusUseCases, flagFor } from "./AdminCostTagStatusUseCases.js";

const t = (over: Partial<CostTagStatusItem> = {}): CostTagStatusItem => ({
  key: "afs-team-id",
  seenInCur: true,
  firstSeenAt: "2026-10-02T00:00:00Z",
  lastSeenAt: "2026-11-20T00:00:00Z",
  awsStatus: "active",
  checkedAt: "2026-11-21T18:00:00Z",
  ...over,
});

describe("flagFor (M5-T1)", () => {
  it("is ok when active and seen", () => expect(flagFor(t())).toBe("ok"));
  it("flags an active key not seen for 3 days", () =>
    expect(flagFor(t({ seenInCur: false, lastSeenAt: "2026-11-18T00:00:00Z" }))).toBe("not-seen"));
  it("does not flag an active key unseen for under 3 days", () =>
    expect(flagFor(t({ seenInCur: false, lastSeenAt: "2026-11-20T00:00:00Z" }))).toBe("ok"));
  it("flags an active key never seen", () =>
    expect(flagFor(t({ seenInCur: false, firstSeenAt: null, lastSeenAt: null }))).toBe("not-seen"));
  it("flags a key AWS does not report as active", () => {
    expect(flagFor(t({ awsStatus: "inactive" }))).toBe("not-active");
    expect(flagFor(t({ awsStatus: "unknown" }))).toBe("not-active");
  });
  it("lists through the port", async () => {
    const items = [t()];
    expect(await new AdminCostTagStatusUseCases({ list: async () => items }).list()).toBe(items);
  });
});
