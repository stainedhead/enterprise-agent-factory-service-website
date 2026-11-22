import { describe, expect, it, vi } from "vitest";
import { WaitError, type WaitStatus, waitFor } from "./wait.js";

const st = (phase: string, generation = 1, observed = 1): WaitStatus => ({
  generation,
  status: { phase, observedGeneration: observed },
});

function clock() {
  let t = 0;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    sleeps,
  };
}

describe("waitFor (M1-K1)", () => {
  it("polls every 5 s for 2 minutes, then every 30 s", async () => {
    const c = clock();
    let n = 0;
    const get = vi.fn(async () => (++n < 30 ? st("Reconciling") : st("Ready")));
    await waitFor(get, { ...c });
    expect(c.sleeps.slice(0, 24)).toEqual(Array(24).fill(5000));
    expect(c.sleeps.slice(24)).toEqual(Array(c.sleeps.length - 24).fill(30000));
  });

  it("resolves only when the phase is targeted and observedGeneration >= generation", async () => {
    const c = clock();
    const seq = [st("Ready", 3, 2), st("Ready", 3, 3)];
    const get = vi.fn(async () => seq.shift() as WaitStatus);
    const r = await waitFor({ getStatus: get }, { ...c });
    expect(get).toHaveBeenCalledTimes(2);
    expect(r.status.observedGeneration).toBe(3);
  });

  it("rejects with the status on Failed", async () => {
    const c = clock();
    await expect(waitFor(async () => st("Failed"), { ...c })).rejects.toMatchObject({
      name: "WaitError",
      reason: "failed",
      status: { status: { phase: "Failed" } },
    });
  });

  it("rejects on Degraded unless targeted", async () => {
    const c = clock();
    await expect(waitFor(async () => st("Degraded"), { ...c })).rejects.toMatchObject({
      reason: "degraded",
    });
    expect(
      (await waitFor(async () => st("Degraded"), { ...c, until: ["Degraded"] })).status.phase,
    ).toBe("Degraded");
  });

  it("rejects on timeout with the last status", async () => {
    const c = clock();
    const p = waitFor(async () => st("Pending"), { ...c, timeoutMs: 20_000 });
    await expect(p).rejects.toMatchObject({ reason: "timeout" });
    expect(c.now()).toBe(20_000);
  });

  it("rejects on abort, also before the first read", async () => {
    const ac = new AbortController();
    const c = clock();
    const get = vi.fn(async () => st("Pending"));
    const sleep = async (ms: number) => {
      await c.sleep(ms);
      ac.abort();
    };
    await expect(waitFor(get, { now: c.now, sleep, signal: ac.signal })).rejects.toBeInstanceOf(
      WaitError,
    );
    await expect(waitFor(get, { signal: ac.signal })).rejects.toMatchObject({ reason: "aborted" });
  });

  it("defaultSleep resolves on abort and after the delay", async () => {
    vi.useFakeTimers();
    const ac = new AbortController();
    let n = 0;
    const p = waitFor(async () => (++n < 2 ? st("Pending") : st("Ready")), { signal: ac.signal });
    await vi.advanceTimersByTimeAsync(5000);
    expect((await p).status.phase).toBe("Ready");
    vi.useRealTimers();
  });
});
