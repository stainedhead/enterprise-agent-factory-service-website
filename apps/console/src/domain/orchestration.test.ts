import { describe, expect, it } from "vitest";
import { renderCli } from "./cli.js";
import {
  aboveLimit,
  allHealthy,
  changeToolCli,
  changeToolWarning,
  exposureOptions,
  exposureView,
  isOrchestrationRole,
  isToolManaged,
  managedByLabel,
  naTooltip,
  notApplicableText,
  openToolState,
  orchestrationShorthand,
  putOrchestrationCli,
  reasonText,
  reservedSecretName,
  safeWebUrl,
  setLimitCli,
  shortId,
  toolInfo,
  toolLabel,
} from "./orchestration.js";

describe("tools", () => {
  it("names Paperclip AI and Buzz, never the harness", () => {
    expect(toolLabel("paperclip")).toBe("Paperclip AI");
    expect(toolLabel("buzz")).toBe("Buzz");
    expect(toolInfo("buzz")).toMatchObject({
      preview: true,
      webUi: false,
      webApi: false,
      port: 3000,
    });
    expect(toolInfo("paperclip")).toMatchObject({ webUi: true, webApi: true, port: 3100 });
    expect(JSON.stringify(toolInfo("paperclip")).toLowerCase()).not.toContain("hermes");
  });
  it("passes an unknown tool through", () => {
    expect(toolLabel("future")).toBe("future");
    expect(toolInfo("future").mark).toBe("F");
  });
  it("Buzz N/A texts state why", () => {
    expect(notApplicableText("buzz", "webUi")).toBe(
      "N/A for Buzz. Buzz has no browser client, so the Web UI stays off and disconnected",
    );
    expect(notApplicableText("buzz", "webApi")).toBe(
      "N/A for Buzz. Buzz has no REST API, so the Web API stays off",
    );
    expect(naTooltip("buzz")).toBe("N/A for Buzz: no web UI or REST API outside the cluster");
  });
});

describe("exposure", () => {
  it("orders off < private < public", () => {
    expect(aboveLimit("public", "private")).toBe(true);
    expect(aboveLimit("private", "private")).toBe(false);
    expect(aboveLimit("off", "off")).toBe(false);
  });
  it("greys out levels above the limit with the reason, keeping them visible", () => {
    const o = exposureOptions({ limit: "private", supported: true, tool: "paperclip" });
    expect(o.map((x) => x.value)).toEqual(["off", "private", "public"]);
    expect(o[0]?.disabledReason).toBeUndefined();
    expect(o[1]?.disabledReason).toBeUndefined();
    expect(o[2]?.disabledReason).toContain("Above this team's limit (Private)");
  });
  it("a limit of off leaves only off", () => {
    const o = exposureOptions({ limit: "off", supported: true, tool: "paperclip" });
    expect(o.filter((x) => !x.disabledReason).map((x) => x.value)).toEqual(["off"]);
  });
  it("an unsupported surface leaves only off, N/A for the tool", () => {
    const o = exposureOptions({ limit: "public", supported: false, tool: "buzz" });
    expect(o.filter((x) => !x.disabledReason).map((x) => x.value)).toEqual(["off"]);
    expect(o[2]?.disabledReason).toBe(naTooltip("buzz"));
  });
  it("state words: public amber, private blue, off grey", () => {
    expect(exposureView("public")).toEqual({ word: "Public", dot: "amber" });
    expect(exposureView("private")).toEqual({ word: "Private", dot: "blue" });
    expect(exposureView("off")).toEqual({ word: "Off", dot: "grey" });
  });
  it("reason texts, with an unknown reason passed through", () => {
    expect(reasonText("team_limit")).toContain("limit");
    expect(reasonText("base_domain_unset")).toContain("base domain");
    expect(reasonText("future")).toBe("future");
  });
});

describe("open the tool precedence (ORC-23)", () => {
  const base = {
    tool: "paperclip",
    hostname: "a.example",
    supported: true,
    effective: "private",
    reasons: [] as string[],
    phase: "Ready",
    canAccess: true,
  };
  it("is enabled when everything holds", () => {
    expect(openToolState(base)).toEqual({ enabled: true });
  });
  it("needs collaboration:access first", () => {
    expect(openToolState({ ...base, canAccess: false, supported: false }).reason).toBe(
      "Requires team-viewer",
    );
  });
  it("a tool without a web UI says N/A", () => {
    expect(
      openToolState({ ...base, tool: "buzz", supported: false, effective: "off" }).reason,
    ).toBe("N/A for Buzz: no web UI or REST API outside the cluster");
  });
  it("an off web UI names its first reason (not the provider one), else the generic text", () => {
    expect(
      openToolState({
        ...base,
        effective: "off",
        reasons: ["provider_without_collab_client", "team_limit"],
      }).reason,
    ).toBe(reasonText("team_limit"));
    expect(openToolState({ ...base, effective: "off" }).reason).toContain("Web UI is off");
  });
  it("then no hostname, a suspended team and the phase", () => {
    expect(openToolState({ ...base, hostname: null }).reason).toBe("No address is configured");
    expect(openToolState({ ...base, teamState: "suspended" }).reason).toBe("Team is suspended");
    expect(openToolState({ ...base, phase: "Degraded" }).reason).toBe(
      "The orchestration agent is Degraded",
    );
  });
});

describe("conditions and secrets", () => {
  it("allHealthy treats the unmanaged-agents condition as inverted and a missing one as unhealthy", () => {
    const ok = [
      { type: "EndpointReady", status: "True" },
      { type: "ToolReady", status: "True" },
      { type: "RegistrationHealthy", status: "True" },
      { type: "UnmanagedToolAgents", status: "False" },
    ];
    expect(allHealthy(ok)).toBe(true);
    expect(allHealthy(ok.slice(1))).toBe(false);
    expect(
      allHealthy(ok.map((c) => (c.type === "UnmanagedToolAgents" ? { ...c, status: "True" } : c))),
    ).toBe(false);
  });
  it("labels and filters tool-managed secrets of the orchestration agent only", () => {
    expect(managedByLabel("afs")).toBe("Managed by AFS");
    expect(managedByLabel("paperclip")).toBe("Managed by Paperclip");
    expect(managedByLabel("buzz")).toBe("Managed by Buzz");
    expect(managedByLabel("user")).toBe("Team");
    expect(isToolManaged({ managedBy: "afs", agentId: "a" }, "a")).toBe(true);
    expect(isToolManaged({ managedBy: "afs", agentId: "b" }, "a")).toBe(false);
    expect(isToolManaged({ managedBy: "user", agentId: "a" }, "a")).toBe(false);
  });
  it("reserves paperclip and buzz names except the workers' own keys", () => {
    expect(reservedSecretName("paperclip", "team")).toBe(true);
    expect(reservedSecretName("buzz-x", "team")).toBe(true);
    expect(reservedSecretName("paperclip-agent-api-key", "agent")).toBe(false);
    expect(reservedSecretName("buzz-agent-private-key", "agent")).toBe(false);
    expect(reservedSecretName("buzz-agent-private-key", "team")).toBe(true);
    expect(reservedSecretName("mypaperclip", "team")).toBe(false);
  });
  it("reads a 1.0.1 collaboration role as orchestration", () => {
    expect(isOrchestrationRole("orchestration")).toBe(true);
    expect(isOrchestrationRole("collaboration")).toBe(true);
    expect(isOrchestrationRole("worker")).toBe(false);
    expect(isOrchestrationRole(undefined)).toBe(false);
  });
});

describe("afs commands (ORC-24, ORC-29)", () => {
  it("put-orchestration with --if-match", () => {
    expect(
      renderCli(putOrchestrationCli("team_1", { webUi: "private", webApi: "off", version: 7 })),
    ).toBe(
      "afs orchestration put-orchestration --team-id team_1 --web-ui-exposure private --web-api-exposure off --if-match 7",
    );
    expect(
      renderCli(
        putOrchestrationCli("team_1", { webUi: "off", webApi: "off", registrationMode: "managed" }),
      ),
    ).toContain("--registration-mode managed");
  });
  it("change-collaboration-tool and set the limit", () => {
    expect(renderCli(changeToolCli("team_1", "buzz"))).toBe(
      "afs orchestration change-collaboration-tool --team-id team_1 --tool buzz",
    );
    expect(renderCli(setLimitCli("team_1", "public"))).toBe(
      "afs teams update-team --team-id team_1 --max-collaboration-exposure public",
    );
  });
  it("the create-team shorthand", () => {
    expect(
      orchestrationShorthand({
        tool: "paperclip",
        webUiExposure: "private",
        webApiExposure: "off",
        modelId: "m1",
      }),
    ).toBe("Tool=paperclip,WebUiExposure=private,WebApiExposure=off,ModelId=m1");
    expect(
      orchestrationShorthand({ tool: "buzz", webUiExposure: "off", webApiExposure: "off" }),
    ).toBe("Tool=buzz,WebUiExposure=off,WebApiExposure=off");
  });
  it("the change-tool warning says content is not moved", () => {
    expect(changeToolWarning("paperclip", "buzz")).toContain("empty data directory");
  });
  it("shortId and safeWebUrl", () => {
    expect(shortId("team_01JD2Q3R4S5T")).toBe("team_01JD2Q3…");
    expect(shortId("short")).toBe("short");
    expect(safeWebUrl("https://acme.collab.example/")).toBe("https://acme.collab.example/");
    expect(safeWebUrl("javascript:alert(1)")).toBeNull();
    expect(safeWebUrl("data:text/html,x")).toBeNull();
    expect(safeWebUrl(null)).toBeNull();
    expect(safeWebUrl("not a url")).toBeNull();
  });
});
