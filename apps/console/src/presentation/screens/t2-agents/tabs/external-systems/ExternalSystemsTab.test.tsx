import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { anAgent } from "../../../../testing/agents.js";
import {
  aSystem,
  externalSystemsServices,
  fakeExternalSystemsPort,
} from "../../../../testing/externalSystems.js";
import { TEAM_ADMIN, VIEWER } from "../../../../testing/harness.js";
import { renderScreen } from "../../../../testing/screen.js";
import { ExternalSystemsTab } from "./ExternalSystemsTab.js";

function open(me = TEAM_ADMIN) {
  const port = fakeExternalSystemsPort({
    listAgent: async () => [
      aSystem(),
      aSystem({ id: "ext_2", name: "Slack", disabledAt: "team" }),
      aSystem({ id: "ext_3", name: "Jira", disabledAt: "agent" }),
    ],
  });
  renderScreen(<ExternalSystemsTab teamId="team_1" agent={anAgent()} />, {
    me,
    services: externalSystemsServices(port),
    path: "/t/team_1/agents/agt_1",
    route: "/t/:teamId/agents/:agentId",
  });
  return port;
}

describe("T10 External systems tab (M2-E3)", () => {
  it("shows the level a system is off at, and locks higher levels", async () => {
    open();
    expect(await screen.findByText("Off at team level")).toBeTruthy();
    expect(screen.getByText("Off at agent level")).toBeTruthy();
    await userEvent.click(screen.getByRole("switch", { name: "Slack" }));
    await userEvent.click(screen.getByRole("switch", { name: "GitHub" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "Jira" })).toBeTruthy());
  });
  it("switches a system off for this agent only", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("switch", { name: "GitHub" }));
    await waitFor(() => expect(port.setAgentState).toHaveBeenCalledTimes(1));
    expect(port.setAgentState.mock.calls[0]?.[3]).toBe(false);
    expect(port.setTeamState).not.toHaveBeenCalled();
  });
  it("is read-only for a viewer", async () => {
    const port = open(VIEWER);
    await userEvent.click(await screen.findByRole("switch", { name: "GitHub" }));
    expect(port.setAgentState).not.toHaveBeenCalled();
  });
});
