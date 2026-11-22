import { describe, expect, it } from "vitest";
import { aSystem, fakeExternalSystemsPort } from "../../../presentation/testing/externalSystems.js";
import { checkSystem, ExternalSystemsUseCases, switchState } from "./ExternalSystemsUseCases.js";

const good = {
  name: "Internal CI",
  slug: "internal-ci",
  category: "dev_tools",
  owner: "ops",
  purpose: "builds",
  endpoints: ["ci.example.com"],
};

describe("switchState", () => {
  it("is on when enabled", () => {
    expect(switchState(aSystem(), "team")).toEqual({ on: true, level: undefined, locked: false });
  });
  it("is off and locked when off at the service level", () => {
    expect(switchState(aSystem({ enabled: false }), "team")).toEqual({
      on: false,
      level: "service",
      locked: true,
    });
  });
  it("is off and editable at the level being edited", () => {
    expect(switchState(aSystem({ disabledAt: "team" }), "team").locked).toBe(false);
  });
  it("is locked at agent level when off for the team", () => {
    expect(switchState(aSystem({ disabledAt: "team" }), "agent")).toMatchObject({
      level: "team",
      locked: true,
    });
  });
  it("is editable at agent level when off at the agent", () => {
    expect(switchState(aSystem({ disabledAt: "agent" }), "agent").locked).toBe(false);
  });
});

describe("checkSystem", () => {
  it("accepts a complete declaration", () => {
    expect(checkSystem(good, true)).toBeUndefined();
  });
  it.each([
    ["name", { ...good, name: " " }],
    ["slug", { ...good, slug: "X" }],
    ["owner", { ...good, owner: "" }],
    ["purpose", { ...good, purpose: "" }],
    ["endpoints", { ...good, endpoints: [] }],
    ["endpoints", { ...good, endpoints: ["bad endpoint"] }],
  ])("refuses a bad %s", (field, input) => {
    expect(checkSystem(input, true)?.fields?.[field]).toBeTruthy();
  });
  it("checks only given fields on update", () => {
    expect(checkSystem({ owner: "" }, false)).toBeUndefined();
    expect(checkSystem({ endpoints: [] }, false)).toBeDefined();
  });
});

describe("ExternalSystemsUseCases", () => {
  it("delegates reads and state changes", async () => {
    const port = fakeExternalSystemsPort();
    const uc = new ExternalSystemsUseCases(port);
    expect((await uc.listTeam("t")).length).toBe(5);
    expect((await uc.listAgent("t", "a")).length).toBe(5);
    await uc.setTeamState("t", { id: "ext_1" }, false);
    await uc.setAgentState("t", "a", { id: "ext_1" }, false);
    await uc.deleteTeam("t", { id: "ext_5" });
    expect(port.setTeamState).toHaveBeenCalledWith("t", { id: "ext_1" }, false);
    expect(port.setAgentState).toHaveBeenCalledWith("t", "a", { id: "ext_1" }, false);
    expect(port.deleteTeam).toHaveBeenCalled();
  });
  it("validates before declare and update", async () => {
    const port = fakeExternalSystemsPort();
    const uc = new ExternalSystemsUseCases(port);
    await expect(uc.declare("t", { ...good, name: "" })).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(uc.updateTeam("t", { id: "x" }, { endpoints: [] })).rejects.toBeDefined();
    expect(port.declare).not.toHaveBeenCalled();
    await uc.declare("t", good);
    await uc.updateTeam("t", { id: "x" }, { owner: "me" });
    expect(port.declare).toHaveBeenCalled();
    expect(port.updateTeam).toHaveBeenCalled();
  });
});
