import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { anAgent } from "../../../../testing/agents.js";
import { TEAM_ADMIN } from "../../../../testing/harness.js";
import { aReport, fakeReportsPort, reportsServices } from "../../../../testing/reports.js";
import { renderScreen } from "../../../../testing/screen.js";
import { UsageTab } from "./UsageTab.js";

describe("T2 Usage tab (M3-R6)", () => {
  it("shows spend, calls, tokens, utilization and longest idle with a link to the full report", async () => {
    const port = fakeReportsPort({
      run: async (_s, kind) =>
        kind === "activity"
          ? aReport({
              kind: "activity",
              rows: [{ agent: "agt_1", state: "idle", idleSeconds: 3600 }],
              totals: {},
            })
          : aReport(),
    });
    renderScreen(<UsageTab teamId="team_1" agent={anAgent()} />, {
      me: TEAM_ADMIN,
      services: reportsServices(port),
      path: "/t/team_1/agents/agt_1",
      route: "/t/:teamId/agents/:agentId",
    });
    expect(await screen.findByText("$15.75")).toBeTruthy();
    expect(screen.getByText("50")).toBeTruthy();
    expect(screen.getByText("1 h 00 min")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the full report" }).getAttribute("href")).toMatch(
      /\/t\/team_1\/reports\/agents\//,
    );
  });
});
