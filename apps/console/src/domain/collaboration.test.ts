import { describe, expect, it } from "vitest";
import {
  aggregatePeople,
  conditionView,
  linkStateView,
  MASTER_KEY,
  managedRefusalText,
  NOT_CONNECTED,
  ROTATABLE_KEYS,
} from "./collaboration.js";

describe("state words", () => {
  it("link states: linked green, pending amber, failed red, disabled grey, unknown raw", () => {
    expect(linkStateView("linked").dot).toBe("green");
    expect(linkStateView("pending").dot).toBe("amber");
    expect(linkStateView("failed").dot).toBe("red");
    expect(linkStateView("disabled").dot).toBe("grey");
    expect(linkStateView("future")).toEqual({ word: "future", dot: "grey" });
    expect(NOT_CONNECTED.word).toBe("Not connected");
  });
  it("conditions: healthy is green, the inverted ones are healthy when False, unknown is amber", () => {
    expect(conditionView({ type: "EndpointReady", status: "True" })).toEqual({
      word: "True",
      dot: "green",
    });
    expect(conditionView({ type: "ToolReady", status: "False" }).dot).toBe("red");
    expect(conditionView({ type: "UnmanagedToolAgents", status: "False" }).dot).toBe("green");
    expect(conditionView({ type: "UnmanagedToolAgents", status: "True" }).dot).toBe("red");
    expect(conditionView({ type: "ToolChanging", status: "True" }).dot).toBe("red");
    expect(conditionView({ type: "ToolChanging", status: "False" }).dot).toBe("green");
    expect(conditionView({ type: "ToolReady", status: "Unknown" })).toEqual({
      word: "Unknown",
      dot: "amber",
    });
  });
});

describe("aggregatePeople", () => {
  it("sums day rows per person, sorts by requests, labels api keys, marks service admin entry", () => {
    const out = aggregatePeople([
      { principal: { id: "u1", name: "dana" }, signIns: 2, requests: 10, deniedRequests: 1 },
      { principal: { id: "u1", name: "dana" }, signIns: 1, requests: 5, deniedRequests: 0 },
      { principal: { id: "k1", type: "api_key", name: "ci" }, requests: 40 },
      { principal: { id: "u2" }, requests: 3, serviceAdminEntry: true },
      {},
    ]);
    expect(out.map((p) => p.label)).toEqual(["ci (API key)", "dana", "u2"]);
    expect(out[1]).toMatchObject({ signIns: 3, requests: 15, deniedRequests: 1 });
    expect(out[2]?.serviceAdminEntry).toBe(true);
  });
  it("keeps the top ten", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      principal: { id: `u${i}` },
      requests: i,
    }));
    expect(aggregatePeople(rows)).toHaveLength(10);
  });
});

describe("rotation and managed-secret refusals", () => {
  it("never lists the master key as rotatable", () => {
    expect(ROTATABLE_KEYS).not.toContain(MASTER_KEY);
  });
  it("words the API's refusals and ignores other reasons", () => {
    expect(managedRefusalText("managed_secret", "paperclip")).toContain("Paperclip");
    expect(managedRefusalText("managed_secret", "afs")).toContain("AFS");
    expect(managedRefusalText("master_key_not_rotatable")).toContain("Cannot be rotated");
    expect(managedRefusalText("other")).toBeUndefined();
  });
});
