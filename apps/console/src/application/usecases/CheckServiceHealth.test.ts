import { describe, expect, it } from "vitest";
import { CheckServiceHealth } from "./CheckServiceHealth.js";

describe("CheckServiceHealth", () => {
  it("reports up when the port is healthy", async () => {
    const uc = new CheckServiceHealth({ check: async () => ({ healthy: true }) });
    await expect(uc.execute()).resolves.toEqual({ state: "up" });
  });

  it("reports down with the reason when the port throws", async () => {
    const uc = new CheckServiceHealth({
      check: async () => {
        throw new Error("connection refused");
      },
    });
    await expect(uc.execute()).resolves.toEqual({ state: "down", reason: "connection refused" });
  });
});
