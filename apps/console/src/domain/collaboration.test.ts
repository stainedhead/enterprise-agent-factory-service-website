import { describe, expect, it } from "vitest";
import {
  aggregatePeople,
  conditionView,
  isCollaborationManaged,
  linkStateView,
  managedByLabel,
  openPaperclipState,
  reasonText,
  reservedSecretName,
  shortId,
  surfaceSwitch,
  surfaceView,
} from "./collaboration.js";

describe("reason texts", () => {
  it.each([
    ["team_not_allowed", "Not allowed for this team by the service"],
    ["collaboration_not_allowed_for_team", "Not allowed for this team by the service"],
    ["service_endpoints_off", "Public collaboration is off for the service"],
    ["collab_public_endpoints_off", "Public collaboration is off for the service"],
    ["base_domain_unset", "Public collaboration is not configured for the service"],
    ["collab_base_domain_unset", "Public collaboration is not configured for the service"],
    [
      "provider_without_collab_client",
      "Your sign-in provider has no collaboration client; ask a service admin",
    ],
  ])("%s", (r, text) => expect(reasonText(r)).toBe(text));
  it("passes an unknown reason through as its raw string", () => {
    expect(reasonText("future_reason")).toBe("future_reason");
  });
});

describe("state words", () => {
  it("surface On is green and Off is grey", () => {
    expect(surfaceView(true)).toEqual({ word: "On", dot: "green" });
    expect(surfaceView(false)).toEqual({ word: "Off", dot: "grey" });
  });
  it("link states: linked green, pending amber, failed red, disabled grey, unknown raw", () => {
    expect(linkStateView("linked").dot).toBe("green");
    expect(linkStateView("pending").dot).toBe("amber");
    expect(linkStateView("failed").dot).toBe("red");
    expect(linkStateView("disabled").dot).toBe("grey");
    expect(linkStateView("future")).toEqual({ word: "future", dot: "grey" });
  });
  it("conditions: healthy is green, the unmanaged-agents rule is inverted, unknown is amber", () => {
    expect(conditionView({ type: "EndpointReady", status: "True" })).toEqual({
      word: "True",
      dot: "green",
    });
    expect(conditionView({ type: "PaperclipReady", status: "False" }).dot).toBe("red");
    expect(conditionView({ type: "UnmanagedPaperclipAgents", status: "False" }).dot).toBe("green");
    expect(conditionView({ type: "UnmanagedPaperclipAgents", status: "True" }).dot).toBe("red");
    expect(conditionView({ type: "RegistrationHealthy", status: "weird" })).toEqual({
      word: "Unknown",
      dot: "amber",
    });
  });
});

describe("open-paperclip precedence", () => {
  const ok = {
    hostname: "a.collab.example.com",
    effectiveWebUi: true,
    reasons: [],
    teamState: "active",
    phase: "Ready",
    canAccess: true,
  };
  it("is enabled when everything holds", () => {
    expect(openPaperclipState(ok)).toEqual({ enabled: true });
  });
  it("needs collaboration:access first", () => {
    expect(openPaperclipState({ ...ok, canAccess: false, hostname: null }).reason).toBe(
      "Requires team-viewer",
    );
  });
  it("no hostname beats everything else", () => {
    const s = openPaperclipState({ ...ok, hostname: null, effectiveWebUi: false, phase: "Failed" });
    expect(s.reason).toBe("Public collaboration is not configured for the service");
  });
  it("a non-effective web UI names its first reason, else the generic text", () => {
    expect(
      openPaperclipState({ ...ok, effectiveWebUi: false, reasons: ["team_not_allowed"] }).reason,
    ).toBe("Not allowed for this team by the service");
    expect(openPaperclipState({ ...ok, effectiveWebUi: false }).reason).toBe(
      "The web UI is off. A team-admin can turn it on.",
    );
  });
  it("then a suspended team, then the phase", () => {
    expect(openPaperclipState({ ...ok, teamState: "suspended", phase: "Pending" }).reason).toBe(
      "Team is suspended",
    );
    expect(openPaperclipState({ ...ok, phase: "Pending" }).reason).toBe(
      "The collaboration agent is Pending",
    );
  });
});

describe("surface switch (WP-D3)", () => {
  it("effective: On, no note", () => {
    expect(surfaceSwitch({ stored: true, effective: true, reasons: [] }).state.word).toBe("On");
  });
  it("stored off and blocked: disabled with the reason", () => {
    expect(
      surfaceSwitch({ stored: false, effective: false, reasons: ["base_domain_unset"] }),
    ).toMatchObject({
      disabledReason: "Public collaboration is not configured for the service",
    });
  });
  it("stored on but not effective: stays enabled, says it is not serving, reads Off", () => {
    const s = surfaceSwitch({ stored: true, effective: false, reasons: ["team_not_allowed"] });
    expect(s.disabledReason).toBeUndefined();
    expect(s.notServing).toBe("Not allowed for this team by the service");
    expect(s.state.word).toBe("Off");
  });
  it("stored off and not blocked stays enabled", () => {
    expect(surfaceSwitch({ stored: false, effective: false, reasons: [] }).disabledReason).toBe(
      undefined,
    );
  });
});

describe("managed secrets", () => {
  it("keeps only afs and paperclip secrets of the collaboration agent", () => {
    expect(isCollaborationManaged({ managedBy: "paperclip", agentId: "a" }, "a")).toBe(true);
    expect(isCollaborationManaged({ managedBy: "afs", agentId: "a" }, "a")).toBe(true);
    expect(isCollaborationManaged({ managedBy: "paperclip", agentId: "b" }, "a")).toBe(false);
    expect(isCollaborationManaged({ managedBy: "user", agentId: "a" }, "a")).toBe(false);
    expect(isCollaborationManaged({ agentId: "a" }, "a")).toBe(false);
  });
  it("labels", () => {
    expect(managedByLabel("afs")).toBe("Managed by AFS");
    expect(managedByLabel("paperclip")).toBe("Managed by Paperclip");
    expect(managedByLabel("user")).toBe("Team");
    expect(managedByLabel(undefined)).toBe("Team");
    expect(managedByLabel("future")).toBe("future");
  });
  it("reserved names", () => {
    expect(reservedSecretName("paperclip", "team")).toBe(true);
    expect(reservedSecretName("paperclip-x", "agent")).toBe(true);
    expect(reservedSecretName("paperclip-agent-api-key", "agent")).toBe(false);
    expect(reservedSecretName("paperclip-agent-api-key", "team")).toBe(true);
    expect(reservedSecretName("mypaperclip", "team")).toBe(false);
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

describe("shortId", () => {
  it("shortens to 12 characters and an ellipsis", () => {
    expect(shortId("team_01JD2Q3R4S5T")).toBe("team_01JD2Q3…");
    expect(shortId("short")).toBe("short");
  });
});
