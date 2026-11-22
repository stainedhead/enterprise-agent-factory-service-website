import { describe, expect, it, vi } from "vitest";
import type { ChannelRecord, NotificationsPort } from "../../ports/notifications.js";
import { deliveryWord, NotificationsUseCases, parseEvents } from "./NotificationsUseCases.js";

const aChannel = (over: Partial<ChannelRecord> = {}): ChannelRecord => ({
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

const port = (over: Partial<NotificationsPort> = {}) =>
  ({
    list: vi.fn(async () => [aChannel()]),
    get: vi.fn(async () => aChannel()),
    create: vi.fn(async () => aChannel()),
    update: vi.fn(async () => aChannel()),
    delete: vi.fn(async () => undefined),
    test: vi.fn(async () => ({ testId: "t1", delivered: true, pending: false, error: undefined })),
    schedules: vi.fn(async () => [
      { id: "rs_1", name: "Weekly", channelId: "nch_1" },
      { id: "rs_2", name: "Other", channelId: "nch_2" },
    ]),
    ...over,
  }) as unknown as NotificationsPort & Record<string, ReturnType<typeof vi.fn>>;

const clock = { setTimeout: (fn: () => void) => (fn(), 0) };

describe("NotificationsUseCases", () => {
  it("parses events, dropping blanks and duplicates", () => {
    expect(parseEvents("budget.*, agent.failed  budget.*")).toEqual(["budget.*", "agent.failed"]);
  });

  it.each([
    [{ name: " " }, "name"],
    [{ eventTypes: [] }, "eventTypes"],
    [{ config: {} }, "channel"],
    [{ secretId: undefined }, "secretId"],
  ])("refuses an invalid create %j without calling the API", async (over, field) => {
    const p = port();
    const uc = new NotificationsUseCases(p, clock);
    await expect(
      uc.create("t", {
        name: "n",
        kind: "slack",
        eventTypes: ["budget.*"],
        config: { channel: "#a" },
        secretId: "sec_1",
        ...over,
      }),
    ).rejects.toMatchObject({ fields: { [field]: expect.any(String) } });
    expect(p.create).not.toHaveBeenCalled();
  });

  it("requires an https webhook and no secret for email", async () => {
    const uc = new NotificationsUseCases(port(), clock);
    await expect(
      uc.create("t", {
        name: "n",
        kind: "webhook",
        eventTypes: ["a"],
        config: { url: "http://x" },
        secretId: "sec_1",
      }),
    ).rejects.toMatchObject({ fields: { url: expect.any(String) } });
    await expect(
      uc.create("t", { name: "n", kind: "email", eventTypes: ["a"], config: { to: "a@b.c" } }),
    ).resolves.toBeTruthy();
  });

  it("updates with the version it read and refuses an empty name", async () => {
    const p = port();
    const uc = new NotificationsUseCases(p, clock);
    await uc.update("t", aChannel(), { enabled: false });
    expect(p.update).toHaveBeenCalledWith("t", { id: "nch_1", version: 3 }, { enabled: false });
    await expect(uc.update("t", aChannel(), { name: " " })).rejects.toMatchObject({
      fields: { name: expect.any(String) },
    });
    await expect(uc.update("t", aChannel(), { eventTypes: [] })).rejects.toBeTruthy();
  });

  it("lists only the schedules that deliver to the channel, and deletes with the version", async () => {
    const p = port();
    const uc = new NotificationsUseCases(p, clock);
    expect((await uc.schedulesUsing("t", "nch_1")).map((s) => s.name)).toEqual(["Weekly"]);
    await uc.delete("t", aChannel());
    expect(p.delete).toHaveBeenCalledWith("t", { id: "nch_1", version: 3 });
  });

  it("returns a 200 test result as is", async () => {
    const p = port();
    const r = await new NotificationsUseCases(p, clock).sendTest("t", "nch_1");
    expect(r.delivered).toBe(true);
    expect(p.get).not.toHaveBeenCalled();
  });

  it("polls a 202 pending test until the channel reports it (CD-3)", async () => {
    const p = port({
      test: vi.fn(async () => ({
        testId: "t9",
        delivered: undefined,
        pending: true,
        error: undefined,
      })),
    });
    (p.get as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(aChannel())
      .mockResolvedValueOnce(
        aChannel({
          delivery: {
            healthy: false,
            lastDeliveredAt: undefined,
            lastFailureAt: "2026-11-22T10:00:00Z",
            lastError: "invalid_auth",
            lastTestId: "t9",
          },
        }),
      );
    const r = await new NotificationsUseCases(p, clock).sendTest("t", "nch_1");
    expect(p.get).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ pending: false, delivered: false, error: "invalid_auth" });
  });

  it("gives up as still pending after the polling limit", async () => {
    const p = port({
      test: vi.fn(async () => ({
        testId: "t9",
        delivered: undefined,
        pending: true,
        error: undefined,
      })),
    });
    const r = await new NotificationsUseCases(p, clock).sendTest("t", "nch_1");
    expect(r.pending).toBe(true);
    expect(p.get).toHaveBeenCalledTimes(15);
  });

  it("words the delivery state", () => {
    expect(deliveryWord(aChannel())).toBe("Delivering");
    expect(deliveryWord(aChannel({ delivery: { ...aChannel().delivery, lastError: "x" } }))).toBe(
      "Failing",
    );
    expect(
      deliveryWord(
        aChannel({
          delivery: {
            healthy: undefined,
            lastDeliveredAt: undefined,
            lastFailureAt: undefined,
            lastError: undefined,
            lastTestId: undefined,
          },
        }),
      ),
    ).toBe("Not yet used");
  });
});
