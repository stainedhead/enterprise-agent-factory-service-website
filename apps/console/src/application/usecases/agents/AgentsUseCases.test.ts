import { describe, expect, it } from "vitest";
import { anAgent, fakeAgentsPort } from "../../../presentation/testing/agents.js";
import { status } from "../../../presentation/testing/teams.js";
import { isAppError } from "../../errors.js";
import { AgentsUseCases, agentPhases, isTemplateRetired } from "./AgentsUseCases.js";

describe("AgentsUseCases (M2-A1)", () => {
  it("lists agents with the month-to-date cost, 0.00 when an agent has none", async () => {
    const rows = await new AgentsUseCases(fakeAgentsPort()).list("team_1");
    expect(rows.map((r) => [r.name, r.costUsd])).toEqual([
      ["reviewer-bot", "12980.00"],
      ["incident-scribe", "0.00"],
    ]);
  });

  it("leaves the cost blank when the usage report cannot be read", async () => {
    const port = fakeAgentsPort({ monthCosts: async () => Promise.reject(new Error("denied")) });
    const rows = await new AgentsUseCases(port).list("team_1");
    expect(rows.every((r) => r.costUsd === undefined)).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it("sends a larger volume size with the agent's version", async () => {
    const port = fakeAgentsPort();
    await new AgentsUseCases(port).expandVolume("team_1", anAgent(), 80);
    expect(port.update).toHaveBeenCalledWith(
      "team_1",
      { id: "agt_1", version: 4 },
      { volume: { sizeGiB: 80 } },
    );
  });

  it.each([50, 20, 0, 1.5, 1001])(
    "refuses %s GiB for a 50 GiB volume before any request",
    async (n) => {
      const port = fakeAgentsPort();
      const e = await new AgentsUseCases(port).expandVolume("team_1", anAgent(), n).catch((x) => x);
      expect(isAppError(e) && e.kind === "validation" && "volume.sizeGiB" in e.fields).toBe(true);
      expect(port.update).not.toHaveBeenCalled();
    },
  );

  it("blank snapshot description is omitted", async () => {
    const port = fakeAgentsPort();
    await new AgentsUseCases(port).takeSnapshot("team_1", "agt_1", "  ");
    expect(port.createSnapshot).toHaveBeenCalledWith("team_1", "agt_1", undefined);
  });

  it("agentPhases treats a paused agent as settled and TemplateRetired reads the condition", () => {
    expect(
      agentPhases([anAgent({ paused: true, status: status("Reconciling") }), anAgent()]),
    ).toEqual(["Ready", "Ready"]);
    const retired = anAgent({
      status: {
        ...status(),
        conditions: [{ type: "TemplateRetired", status: "True", lastTransitionTime: "x" }],
      },
    });
    expect(isTemplateRetired(retired)).toBe(true);
    expect(isTemplateRetired(anAgent())).toBe(false);
  });
});
