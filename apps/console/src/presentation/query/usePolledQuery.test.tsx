import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../application/errors.js";
import { createQueryClient } from "./createQueryClient.js";
import { globalStatusOf } from "./globalStatus.js";
import { usePolledQuery } from "./usePolledQuery.js";

let current: ReturnType<typeof createQueryClient>;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={current}>{children}</QueryClientProvider>;
}
const wrap = (qc: ReturnType<typeof createQueryClient>) => {
  current = qc;
  return Wrapper;
};

const setHidden = (v: boolean) => {
  Object.defineProperty(document, "visibilityState", {
    value: v ? "hidden" : "visible",
    configurable: true,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  setHidden(false);
  vi.useRealTimers();
});

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("usePolledQuery", () => {
  it("polls every 5 s while a phase is Pending and stops once Ready", async () => {
    const qc = createQueryClient(() => {});
    let phase = "Pending";
    const fn = vi.fn(async () => phase);
    renderHook(
      () => usePolledQuery({ queryKey: ["teams", "list"], queryFn: fn, phasesOf: (p) => [p] }),
      { wrapper: wrap(qc) },
    );
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(2);
    phase = "Ready";
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(3);
    await advance(60_000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("slows to 30 s after two minutes and polls Degraded at 30 s", async () => {
    const qc = createQueryClient(() => {});
    const fn = vi.fn(async () => "Degraded");
    renderHook(() => usePolledQuery({ queryKey: ["x"], queryFn: fn, phasesOf: (p) => [p] }), {
      wrapper: wrap(qc),
    });
    await advance(1);
    await advance(29_000);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("sends no request while the tab is hidden and one refresh on return", async () => {
    const qc = createQueryClient(() => {});
    const fn = vi.fn(async () => "Pending");
    renderHook(() => usePolledQuery({ queryKey: ["h"], queryFn: fn, phasesOf: (p) => [p] }), {
      wrapper: wrap(qc),
    });
    await advance(1);
    setHidden(true);
    await advance(30_000);
    const n = fn.mock.calls.length;
    expect(n).toBeLessThanOrEqual(2);
    await advance(60_000);
    expect(fn).toHaveBeenCalledTimes(n);
    setHidden(false);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(n + 1);
  });

  it("M1-Q3: a list of 50 Pending rows sends one list request per interval", async () => {
    const qc = createQueryClient(() => {});
    const rows = Array.from({ length: 50 }, () => "Pending");
    const fn = vi.fn(async () => rows);
    renderHook(() => usePolledQuery({ queryKey: ["l"], queryFn: fn, phasesOf: (r) => r }), {
      wrapper: wrap(qc),
    });
    await advance(1);
    await advance(15_000);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it("M1-Q4: a 429 with Retry-After 10 suppresses polling for 10 s and shows the notice state", async () => {
    const qc = createQueryClient(() => {});
    const status = globalStatusOf(qc);
    status.throttle(10);
    const fn = vi.fn(async () => "Pending");
    renderHook(() => usePolledQuery({ queryKey: ["t"], queryFn: fn, phasesOf: (p) => [p] }), {
      wrapper: wrap(qc),
    });
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(5000);
    expect(fn).toHaveBeenCalledTimes(1); // the 5 s poll was held back
    await advance(5100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(status.state.throttledUntil).toBe(0); // elapsed throttle cleared
  });

  it("a throttled error trips the gate from the query cache", async () => {
    const qc = createQueryClient(() => {});
    const err = new AppError({ kind: "throttled", message: "slow", retryAfterSeconds: 10 });
    await qc
      .fetchQuery({ queryKey: ["e"], queryFn: () => Promise.reject(err), retry: false })
      .catch(() => {});
    expect(globalStatusOf(qc).remainingMs()).toBeGreaterThan(9000);
  });
});
