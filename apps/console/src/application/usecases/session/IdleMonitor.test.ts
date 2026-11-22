import { describe, expect, it, vi } from "vitest";
import type { ClockPort, SessionChannelPort, SessionMessage } from "../../ports/auth.js";
import { ACTIVITY_THROTTLE_MS, IdleMonitor } from "./IdleMonitor.js";

class FakeClock implements ClockPort {
  t = 1_000_000;
  timers = new Map<number, { at: number; fn: () => void }>();
  #n = 0;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = ++this.#n;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(h: unknown) {
    this.timers.delete(h as number);
  }
  /** Moves time forward in steps of at most 1 s so timers fire in order. */
  async advance(ms: number) {
    for (let left = ms; left > 0; left -= 1000) {
      this.t += Math.min(1000, left);
      for (const [id, tm] of [...this.timers])
        if (tm.at <= this.t) {
          this.timers.delete(id);
          tm.fn();
        }
    }
  }
}

/** A BroadcastChannel-like bus: a message reaches every other tab, never the sender. */
function bus() {
  const subs = new Map<object, Set<(m: SessionMessage) => void>>();
  const posted: { from: string; message: SessionMessage; at: number }[] = [];
  const tab = (name: string, clock: FakeClock): SessionChannelPort => {
    const me = {};
    subs.set(me, new Set());
    return {
      post: (message) => {
        posted.push({ from: name, message, at: clock.t });
        for (const [other, hs] of subs) if (other !== me) for (const h of [...hs]) h(message);
      },
      subscribe: (h) => {
        subs.get(me)?.add(h);
        return () => subs.get(me)?.delete(h);
      },
    };
  };
  return { tab, posted };
}

const MIN = 60_000;

function twoTabs() {
  const clock = new FakeClock();
  const b = bus();
  const idleA = vi.fn();
  const idleB = vi.fn();
  const a = new IdleMonitor(clock, 5, idleA, b.tab("A", clock));
  const c = new IdleMonitor(clock, 5, idleB, b.tab("B", clock));
  a.start();
  c.start();
  return { clock, a, b: c, idleA, idleB, posted: b.posted };
}

describe("IdleMonitor across tabs (FR-005)", () => {
  it("input in tab A keeps tab B from signing out", async () => {
    const { clock, a, idleA, idleB } = twoTabs();
    await clock.advance(4 * MIN);
    a.touch();
    await clock.advance(4 * MIN); // 8 minutes after start, 4 after the input
    expect(idleA).not.toHaveBeenCalled();
    expect(idleB).not.toHaveBeenCalled();
  });

  it("with no input anywhere both tabs sign out", async () => {
    const { clock, idleA, idleB } = twoTabs();
    await clock.advance(5 * MIN);
    expect(idleA).toHaveBeenCalledOnce();
    expect(idleB).toHaveBeenCalledOnce();
  });

  it("signs out both once the shared idle period has passed after the last input in any tab", async () => {
    const { clock, a, idleA, idleB } = twoTabs();
    await clock.advance(4 * MIN);
    a.touch();
    await clock.advance(5 * MIN);
    expect(idleA).toHaveBeenCalledOnce();
    expect(idleB).toHaveBeenCalledOnce();
  });

  it("sends at most one activity message every 30 s, however much input there is", async () => {
    const { clock, a, posted } = twoTabs();
    for (let s = 0; s < 100; s++) {
      a.touch();
      a.touch();
      await clock.advance(1000);
    }
    const msgs = posted.filter((p) => p.from === "A");
    expect(msgs.length).toBeGreaterThan(1);
    for (let i = 1; i < msgs.length; i++)
      expect((msgs[i]?.at ?? 0) - (msgs[i - 1]?.at ?? 0)).toBeGreaterThanOrEqual(
        ACTIVITY_THROTTLE_MS,
      );
    expect(ACTIVITY_THROTTLE_MS).toBe(30_000);
  });

  it("an activity message carries no data and a received one is not re-broadcast", async () => {
    const { clock, a, posted } = twoTabs();
    a.touch();
    await clock.advance(1000);
    expect(posted.map((p) => [p.from, p.message])).toEqual([["A", "activity"]]);
  });

  it("a stopped monitor ignores activity and stays stopped", async () => {
    const { clock, a, b, idleA, idleB } = twoTabs();
    b.stop();
    a.touch();
    await clock.advance(10 * MIN);
    expect(idleA).toHaveBeenCalledOnce();
    expect(idleB).not.toHaveBeenCalled();
    expect(clock.timers.size).toBe(0);
  });

  it("works without a channel (single tab)", async () => {
    const clock = new FakeClock();
    const idle = vi.fn();
    const m = new IdleMonitor(clock, 5, idle);
    m.start();
    m.touch();
    await clock.advance(5 * MIN);
    expect(idle).toHaveBeenCalledOnce();
  });
});
