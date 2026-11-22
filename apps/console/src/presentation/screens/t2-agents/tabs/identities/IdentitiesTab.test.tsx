import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { anAgent } from "../../../../testing/agents.js";
import { TEAM_ADMIN, VIEWER } from "../../../../testing/harness.js";
import { fakeIdentityPort, identityServices } from "../../../../testing/identity.js";
import { renderScreen } from "../../../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../../../testing/teams.js";
import { IdentitiesTab } from "./IdentitiesTab.js";

function open(me = TEAM_ADMIN, port = fakeIdentityPort()) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam());
  renderScreen(<IdentitiesTab teamId="team_1" agent={anAgent()} />, {
    me,
    services: { ...identityServices(port), ...teamsServices(teams) },
    path: "/x",
    route: "/x",
  });
  return port;
}

describe("Identities tab (M4-I5)", () => {
  it("lists external identities with kind, identifier and status", async () => {
    open();
    expect(await screen.findByText("GitHub App")).toBeTruthy();
    expect(screen.getByText("app-123")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
  });
  it("adds an identity, refusing an empty identifier first", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add identity" }));
    const d = screen.getByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Add identity" }));
    expect(await within(d).findByText(/Enter the identifier/)).toBeTruthy();
    expect(port.createIdentity).not.toHaveBeenCalled();
    await userEvent.type(within(d).getByLabelText("Identifier"), "jira-bot");
    await userEvent.click(within(d).getByRole("button", { name: "Add identity" }));
    await waitFor(() => expect(port.createIdentity).toHaveBeenCalled());
    expect(port.createIdentity.mock.calls[0]?.[2]).toMatchObject({
      kind: "external",
      externalRef: "jira-bot",
    });
  });
  it("removes an identity after confirming", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Remove app-123" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() =>
      expect(port.deleteIdentity).toHaveBeenCalledWith("team_1", "agt_1", {
        id: "aid_1",
        version: 1,
      }),
    );
  });
  it("a viewer reads them with add and remove disabled", async () => {
    const port = open(VIEWER);
    expect(await screen.findByText("app-123")).toBeTruthy();
    for (const n of ["Add identity", "Remove app-123"])
      expect(screen.getByRole("button", { name: n }).getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Add identity" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(port.createIdentity).not.toHaveBeenCalled();
  });
});
