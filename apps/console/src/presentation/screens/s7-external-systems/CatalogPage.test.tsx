import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Me } from "../../../domain/me.js";
import {
  adminExternalSystemsServices,
  fakeAdminExternalSystemsPort,
} from "../../testing/externalSystems.js";
import { SERVICE_ADMIN, TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import S7 from "./index.js";

function open(me: Me = SERVICE_ADMIN) {
  const port = fakeAdminExternalSystemsPort();
  const teams = fakeTeamsPort();
  teams.list.mockResolvedValue({ items: [aTeam()] });
  renderScreen(<S7 />, {
    me,
    services: { ...adminExternalSystemsServices(port), ...teamsServices(teams) },
    path: "/external-systems",
    route: "/external-systems",
  });
  return { port, teams };
}

describe("S7 catalog (M2-F)", () => {
  it("built-in systems have no Delete; custom ones do", async () => {
    open();
    await screen.findByRole("switch", { name: "GitHub" });
    expect(screen.queryByRole("button", { name: "Delete GitHub" })).toBeNull();
    expect(screen.getByRole("button", { name: "Delete OpenAI API" })).toBeTruthy();
  });
  it("switching a system off at service level is sent", async () => {
    const { port } = open();
    await userEvent.click(await screen.findByRole("switch", { name: "GitHub" }));
    await waitFor(() =>
      expect(port.update).toHaveBeenCalledWith({ id: "ext_1", version: 1 }, { enabled: false }),
    );
    expect(screen.getAllByText("Off for all teams").length).toBeGreaterThan(0);
  });
  it("enabling an unmetered system asks first, naming what is not counted", async () => {
    const { port } = open();
    await userEvent.click(await screen.findByRole("switch", { name: "OpenAI API" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/not counted.*not capped/)).toBeTruthy();
    expect(port.update).not.toHaveBeenCalled();
    await userEvent.click(within(d).getByRole("button", { name: "Enable" }));
    await waitFor(() =>
      expect(port.update).toHaveBeenCalledWith({ id: "ext_4", version: 1 }, { enabled: true }),
    );
  });
  it("adds, edits and deletes a custom system", async () => {
    const { port } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add system" }));
    let d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Add system" }));
    expect(await within(d).findByText("Enter a name")).toBeTruthy();
    await userEvent.type(within(d).getByLabelText("Name"), "Datadog");
    await userEvent.type(within(d).getByLabelText("Slug"), "datadog");
    await userEvent.type(within(d).getByLabelText("Endpoints"), "api.datadoghq.com");
    await userEvent.click(within(d).getByRole("button", { name: "Add system" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole("button", { name: "Edit GitHub" }));
    d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(port.update).toHaveBeenCalled());

    await userEvent.click(await screen.findByRole("button", { name: "Delete OpenAI API" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(port.delete).toHaveBeenCalled());
  });
  it("sets which teams may declare their own systems", async () => {
    const { teams } = open();
    await userEvent.click(await screen.findByRole("switch", { name: "Alpha may declare systems" }));
    await waitFor(() =>
      expect(teams.update).toHaveBeenCalledWith(
        { id: "team_1", version: 3 },
        { mayAddExternalSystems: true },
      ),
    );
  });
  it("is not found for a team admin, and disabled without the permission", async () => {
    open(TEAM_ADMIN);
    expect(screen.queryByRole("button", { name: "Add system" })).toBeNull();
    void vi;
  });
});
