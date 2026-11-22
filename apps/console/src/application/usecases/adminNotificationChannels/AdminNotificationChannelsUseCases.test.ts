import { describe, expect, it, vi } from "vitest";
import type { AdminNotificationChannelsPort } from "../../ports/adminNotificationChannels.js";
import type { ChannelRecord } from "../../ports/notifications.js";
import { AdminNotificationChannelsUseCases } from "./AdminNotificationChannelsUseCases.js";

const c = { id: "nch_1", version: 3 } as ChannelRecord;
const port = () => ({
  list: vi.fn(async () => []),
  create: vi.fn(async () => c),
  update: vi.fn(async () => c),
  delete: vi.fn(async () => undefined),
});
const uc = () => {
  const p = port();
  return {
    p,
    u: new AdminNotificationChannelsUseCases(p as unknown as AdminNotificationChannelsPort),
  };
};

describe("AdminNotificationChannelsUseCases (M4-N1)", () => {
  it("refuses an incomplete channel before any request", async () => {
    const { p, u } = uc();
    await expect(
      u.create({ name: "x", kind: "email", eventTypes: ["budget.*"], config: {} }),
    ).rejects.toMatchObject({ fields: { to: expect.any(String) } });
    await expect(
      u.create({ name: "x", kind: "slack", eventTypes: ["a"], config: { channel: "#a" } }),
    ).rejects.toMatchObject({ fields: { secretId: expect.any(String) } });
    expect(p.create).not.toHaveBeenCalled();
    await u.create({ name: "x", kind: "email", eventTypes: ["a"], config: { to: "a@b.test" } });
    expect(p.create).toHaveBeenCalled();
  });
  it("updates, toggles and deletes with the version it read", async () => {
    const { p, u } = uc();
    await expect(u.update(c, { name: " " })).rejects.toBeTruthy();
    await expect(u.update(c, { eventTypes: [] })).rejects.toBeTruthy();
    await u.update(c, { name: "n" });
    expect(p.update).toHaveBeenCalledWith({ id: "nch_1", version: 3 }, { name: "n" });
    await u.setEnabled(c, false);
    expect(p.update).toHaveBeenLastCalledWith({ id: "nch_1", version: 3 }, { enabled: false });
    await u.delete(c);
    expect(p.delete).toHaveBeenCalledWith({ id: "nch_1", version: 3 });
  });
});
