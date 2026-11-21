import { describe, expect, it } from "vitest";
import {
  agentView,
  generationNote,
  PollPolicy,
  phaseView,
  poolStateView,
  statusView,
  teamStateView,
} from "./status.js";

describe("status vocabulary (M0-D3)", () => {
  it.each([
    ["Pending", "blue"],
    ["Reconciling", "blue"],
    ["Ready", "green"],
    ["Degraded", "amber"],
    ["Failed", "red"],
    ["Deleting", "grey"],
  ])("%s is a %s dot", (phase, dot) => {
    expect(phaseView(phase)).toEqual({ word: phase, dot });
  });
  it("passes an unknown phase through with a grey dot", () => {
    expect(phaseView("Hibernating")).toEqual({ word: "Hibernating", dot: "grey" });
  });
  it("never produces Running, Healthy or Blocked (cap)", () => {
    const words = [
      ...["Pending", "Reconciling", "Ready", "Degraded", "Failed", "Deleting"].map(
        (p) => phaseView(p).word,
      ),
      ...["active", "suspended", "deleting", "deleted"].map((s) => teamStateView(s).word),
      ...["enabled", "paused", "deleting", "deleted"].map((s) => poolStateView(s).word),
      statusView({ phase: "Ready", conditions: [{ type: "BudgetExhausted", status: "True" }] })
        .word,
    ];
    for (const w of words) expect(["Running", "Healthy", "Blocked (cap)"]).not.toContain(w);
  });
  it("shows Budget blocked only for a Ready resource with BudgetExhausted=True", () => {
    const c = [{ type: "BudgetExhausted", status: "True" }];
    expect(statusView({ phase: "Ready", conditions: c })).toEqual({
      word: "Budget blocked",
      dot: "red",
    });
    expect(statusView({ phase: "Failed", conditions: c }).word).toBe("Failed");
    expect(
      statusView({ phase: "Ready", conditions: [{ type: "BudgetExhausted", status: "False" }] })
        .word,
    ).toBe("Ready");
    expect(statusView({ phase: "Ready" }).word).toBe("Ready");
  });
  it("maps team and pool states and a paused agent", () => {
    expect(teamStateView("active")).toEqual({ word: "Active", dot: "green" });
    expect(teamStateView("suspended").dot).toBe("grey");
    expect(teamStateView("weird")).toEqual({ word: "weird", dot: "grey" });
    expect(poolStateView("enabled").dot).toBe("green");
    expect(poolStateView("paused").word).toBe("Paused");
    expect(poolStateView("x").word).toBe("x");
    expect(agentView({ paused: true, status: { phase: "Ready" } })).toEqual({
      word: "Paused",
      dot: "grey",
    });
    expect(agentView({ status: { phase: "Ready" } }).word).toBe("Ready");
  });
  it("generationNote flags a change not applied yet", () => {
    expect(generationNote(3, 2)).toEqual({ text: "Generation 3, observed 2", pending: true });
    expect(generationNote(3, 3).pending).toBe(false);
  });
});

describe("PollPolicy", () => {
  const next = (phases: string[], elapsedMs = 0, hidden = false, retryAfterSeconds?: number) =>
    PollPolicy.nextDelay({
      phases,
      elapsedMs,
      hidden,
      ...(retryAfterSeconds !== undefined && { retryAfterSeconds }),
    });
  it("5 s for Pending/Reconciling for 2 min, then 30 s", () => {
    expect(next(["Pending"])).toBe(5000);
    expect(next(["Ready", "Reconciling"], 119_999)).toBe(5000);
    expect(next(["Pending"], 120_000)).toBe(30_000);
  });
  it("30 s for Degraded; stop for Ready, Failed, unknown and empty", () => {
    expect(next(["Degraded"])).toBe(30_000);
    expect(next(["Ready"])).toBe("stop");
    expect(next(["Failed", "Ready"])).toBe("stop");
    expect(next(["Mystery"])).toBe("stop");
    expect(next([])).toBe("stop");
  });
  it("any in-progress row keeps the fast cadence over a Degraded one", () => {
    expect(next(["Degraded", "Pending"])).toBe(5000);
  });
  it("stops while hidden", () => {
    expect(next(["Pending"], 0, true)).toBe("stop");
  });
  it("never polls sooner than Retry-After", () => {
    expect(next(["Pending"], 0, false, 10)).toBe(10_000);
    expect(next(["Pending"], 0, false, 1)).toBe(5000);
    expect(next(["Ready"], 0, false, 10)).toBe("stop");
  });
});
