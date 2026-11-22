import { describe, expect, it, vi } from "vitest";
import type { LogDestinationFull, LogDestinationsPort } from "../../ports/logDestinations.js";
import { LogDestinationsUseCases, logDeliveryWord } from "./LogDestinationsUseCases.js";

const d = (over: Partial<LogDestinationFull> = {}): LogDestinationFull => ({
  id: "log_1",
  name: "central",
  kind: "cloudwatch",
  enabled: true,
  config: { logGroup: "/afs/x", region: "eu-west-1" },
  secretId: undefined,
  phase: "Ready",
  delivery: "healthy",
  deliveryMessage: undefined,
  deliveryAt: undefined,
  version: 2,
  ...over,
});
const port = (): { [K in keyof LogDestinationsPort]: ReturnType<typeof vi.fn> } => ({
  list: vi.fn(async () => [d()]),
  create: vi.fn(async () => d()),
  update: vi.fn(async () => d()),
  delete: vi.fn(async () => undefined),
});
const uc = (p = port()) => ({
  p,
  u: new LogDestinationsUseCases(p as unknown as LogDestinationsPort),
});

describe("LogDestinationsUseCases (M4-L1)", () => {
  it.each([
    [{ name: " " }, "name"],
    [{ config: { logGroup: "/a" } }, "region"],
    [{ kind: "splunk_hec" as const, config: { endpoint: "http://x" }, secretId: "s" }, "endpoint"],
    [{ kind: "datadog" as const, config: { site: "datadoghq.com" } }, "secretId"],
    [{ kind: "s3" as const, config: { bucket: "b" } }, "prefix"],
  ])("refuses %j before any request", async (over, field) => {
    const { p, u } = uc();
    await expect(
      u.create("t1", {
        name: "n",
        kind: "cloudwatch",
        config: { logGroup: "/a", region: "r" },
        ...over,
      }),
    ).rejects.toMatchObject({ fields: { [field]: expect.any(String) } });
    expect(p.create).not.toHaveBeenCalled();
  });

  it("creates a valid destination and updates with its version", async () => {
    const { p, u } = uc();
    await u.create("t1", {
      name: "n",
      kind: "datadog",
      config: { site: "datadoghq.com" },
      secretId: "sec_1",
    });
    expect(p.create).toHaveBeenCalled();
    await u.update("t1", d(), { enabled: false });
    expect(p.update).toHaveBeenCalledWith("t1", { id: "log_1", version: 2 }, { enabled: false });
    await u.delete("t1", d());
    expect(p.delete).toHaveBeenCalledWith("t1", { id: "log_1", version: 2 });
  });

  it("refuses an update that blanks a required setting or the name", async () => {
    const { p, u } = uc();
    await expect(u.update("t1", d(), { name: "" })).rejects.toMatchObject({
      fields: { name: expect.any(String) },
    });
    await expect(u.update("t1", d(), { config: { logGroup: "" } })).rejects.toMatchObject({
      fields: { logGroup: expect.any(String) },
    });
    expect(p.update).not.toHaveBeenCalled();
  });

  it("words the delivery", () => {
    expect(logDeliveryWord(d({ delivery: "failing" }))).toBe("Failing");
    expect(logDeliveryWord(d())).toBe("Delivering");
    expect(logDeliveryWord(d({ delivery: "unknown" }))).toBe("Not yet used");
  });
});
