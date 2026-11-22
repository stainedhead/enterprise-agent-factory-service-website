import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Me } from "../../../domain/me.js";
import {
  aSystem,
  externalSystemsServices,
  fakeExternalSystemsPort,
} from "../../testing/externalSystems.js";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T9 from "./index.js";

function open(
  o: { me?: Me; mayAdd?: boolean; port?: ReturnType<typeof fakeExternalSystemsPort> } = {},
) {
  const port = o.port ?? fakeExternalSystemsPort();
  const teams = fakeTeamsPort({
    get: vi.fn(async () => aTeam({ mayAddExternalSystems: o.mayAdd ?? false })),
  });
  renderScreen(<T9 />, {
    me: o.me ?? TEAM_ADMIN,
    services: { ...teamsServices(teams), ...externalSystemsServices(port) },
    path: "/t/team_1/external-systems",
    route: "/t/:teamId/external-systems",
  });
  return port;
}
const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("T9 (M2-E1, E2)", () => {
  it("shows inherited state: off at service level is locked and named; Unmetered is badged", async () => {
    const port = open();
    const jira = await screen.findByRole("switch", { name: "Jira" });
    expect(disabled(jira)).toBe(true);
    expect(screen.getByText("Off at service level")).toBeTruthy();
    expect(screen.getByText("Unmetered")).toBeTruthy();
    await userEvent.click(jira);
    expect(port.setTeamState).not.toHaveBeenCalled();
  });
  it("switches a system off for the team", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("switch", { name: "GitHub" }));
    await waitFor(() =>
      expect(port.setTeamState).toHaveBeenCalledWith("team_1", { id: "ext_1", version: 1 }, false),
    );
  });
  it("Declare system is disabled unless the team may declare", async () => {
    open();
    expect(disabled(await screen.findByRole("button", { name: "Declare system" }))).toBe(true);
  });
  it("declares, edits and deletes a team system when allowed", async () => {
    const port = open({ mayAdd: true });
    const declare = await screen.findByRole("button", { name: "Declare system" });
    await waitFor(() => expect(disabled(declare)).toBe(false));
    await userEvent.click(declare);
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Declare system" }));
    expect(await within(d).findByText("Enter a name")).toBeTruthy();
    await userEvent.type(within(d).getByLabelText("Name"), "Internal CI");
    await userEvent.type(within(d).getByLabelText("Slug"), "internal-ci");
    await userEvent.type(within(d).getByLabelText("Owner"), "ops");
    await userEvent.type(within(d).getByLabelText("Purpose"), "builds");
    await userEvent.type(within(d).getByLabelText("Endpoints"), "ci.example.com");
    await userEvent.click(within(d).getByRole("button", { name: "Declare system" }));
    await waitFor(() => expect(port.declare).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole("button", { name: "Edit Internal CI" }));
    const e = await screen.findByRole("dialog");
    await userEvent.click(within(e).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(port.updateTeam).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole("button", { name: "Delete Internal CI" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(port.deleteTeam).toHaveBeenCalled());
  });
  it("viewers cannot switch or change anything", async () => {
    const port = open({ me: VIEWER, mayAdd: true });
    const sw = await screen.findByRole("switch", { name: "GitHub" });
    expect(sw.closest("span")?.getAttribute("title")).toMatch(/Requires/);
    await userEvent.click(sw);
    expect(port.setTeamState).not.toHaveBeenCalled();
    expect(disabled(screen.getByRole("button", { name: "Edit Internal CI" }))).toBe(true);
  });
  it("shows an API failure", async () => {
    const port = fakeExternalSystemsPort({
      listTeam: vi.fn(async () => [aSystem()]),
      setTeamState: vi.fn(async () => {
        const { AppError } = await import("../../../application/errors.js");
        throw new AppError({ kind: "conflict", message: "nope" });
      }),
    });
    open({ port });
    await userEvent.click(await screen.findByRole("switch", { name: "GitHub" }));
    expect(await screen.findByText("nope")).toBeTruthy();
  });
});
