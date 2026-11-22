import { describe, expect, it } from "vitest";
import type { SessionMessage } from "../../application/ports/auth.js";
import { BroadcastSessionChannel } from "./BroadcastSessionChannel.js";

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("BroadcastSessionChannel (FR-005)", () => {
  const name = () => `afs-test-${Math.random()}`;

  it("delivers signout and activity to another tab, and nothing else", async () => {
    const n = name();
    const a = new BroadcastSessionChannel(n);
    const b = new BroadcastSessionChannel(n);
    const got: SessionMessage[] = [];
    b.subscribe((m) => got.push(m));
    const raw = new BroadcastChannel(n);
    raw.postMessage("hello");
    raw.postMessage({ type: "signout" });
    raw.postMessage(42);
    raw.postMessage("SIGNOUT");
    a.post("activity");
    a.post("signout");
    await tick();
    expect(got).toEqual(["activity", "signout"]);
    raw.close();
  });

  it("sends the bare message string: an activity message carries no data", async () => {
    const n = name();
    const a = new BroadcastSessionChannel(n);
    const raw = new BroadcastChannel(n);
    const seen: unknown[] = [];
    raw.onmessage = (e) => seen.push(e.data);
    a.post("activity");
    await tick();
    expect(seen).toEqual(["activity"]);
    raw.close();
  });

  it("stops delivering after unsubscribe", async () => {
    const n = name();
    const a = new BroadcastSessionChannel(n);
    const b = new BroadcastSessionChannel(n);
    const got: string[] = [];
    const off = b.subscribe((m) => got.push(m));
    off();
    a.post("signout");
    await tick();
    expect(got).toEqual([]);
  });
});
