import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { fakeReportsPort, reportsServices } from "../../testing/reports.js";
import { renderScreen } from "../../testing/screen.js";
import T12 from "./index.js";

const open = (me = TEAM_ADMIN, port = fakeReportsPort()) => {
  renderScreen(<T12 />, {
    me,
    services: reportsServices(port),
    path: "/t/team_1/reports/agents/agt_1",
    route: "/t/:teamId/reports/agents/:agentId",
  });
  return port;
};

describe("T12 agent report (M3-R6)", () => {
  it("runs the usage report for the agent", async () => {
    const port = open();
    expect(await screen.findByText("$15.75")).toBeTruthy();
    expect(port.run).toHaveBeenCalledWith(
      { level: "agent", teamId: "team_1", agentId: "agt_1" },
      "usage",
      expect.anything(),
      expect.anything(),
    );
  });
  it("a viewer reads it", async () => {
    open(VIEWER);
    expect(await screen.findByText("$15.75")).toBeTruthy();
  });
  it("is not found for a caller outside the team", async () => {
    open({ ...VIEWER, permissions: [], teams: [] } as never);
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
