import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../../../application/errors.js";
import type { Me } from "../../../../../domain/me.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../../../testing/harness.js";
import {
  aLogDestination,
  fakeLogDestinationsPort,
  logDestinationsServices,
} from "../../../../testing/logDestinations.js";
import { renderScreen } from "../../../../testing/screen.js";
import { aSecret, fakeSecretsPort, secretsServices } from "../../../../testing/secrets.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../../../testing/teams.js";
import T14 from "../../index.js";

function open(me: Me = TEAM_ADMIN, port = fakeLogDestinationsPort()) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam());
  const secrets = fakeSecretsPort();
  secrets.list.mockResolvedValue([aSecret({ id: "sec_1", name: "hec-token" })]);
  renderScreen(<T14 />, {
    me,
    services: {
      ...logDestinationsServices(port),
      ...secretsServices(secrets),
      ...teamsServices(teams),
    },
    path: "/t/team_1/delivery/logs",
    route: "/t/:teamId/delivery/:tab",
  });
  return port;
}

describe("T14 log delivery (M4-L1)", () => {
  it("lists destinations with kind, state, delivery and status", async () => {
    open();
    expect(await screen.findByText("central")).toBeTruthy();
    expect(screen.getByText("CloudWatch Logs")).toBeTruthy();
    expect(screen.getByText("Delivering")).toBeTruthy();
    expect(screen.getByText("Enabled")).toBeTruthy();
  });
  it("shows a failing destination with its reason", async () => {
    open(
      TEAM_ADMIN,
      fakeLogDestinationsPort({
        list: async () => [
          aLogDestination({ delivery: "failing", deliveryMessage: "HTTP 403 from HEC" }),
        ],
      }),
    );
    expect(await screen.findByText("Failing")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("HTTP 403");
  });
  it("adds a destination with the credential chosen as a secret reference", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add destination" }));
    const d = screen.getByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "splunk");
    await userEvent.selectOptions(within(d).getByLabelText("Kind"), "splunk_hec");
    await userEvent.type(within(d).getByLabelText("HEC endpoint"), "https://hec.example.test");
    await userEvent.click(within(d).getByRole("button", { name: "Add destination" }));
    expect(await within(d).findByText(/Choose the secret/)).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
    await userEvent.selectOptions(within(d).getByLabelText("Credential secret"), "sec_1");
    await userEvent.click(within(d).getByRole("button", { name: "Add destination" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(port.create.mock.calls[0]?.[1]).toMatchObject({ kind: "splunk_hec", secretId: "sec_1" });
  });
  it("edits with the version it read, toggles and deletes after confirming", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit central" }));
    const name = within(screen.getByRole("dialog")).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "central2");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(port.update).toHaveBeenCalled());
    expect(port.update.mock.calls[0]?.[1]).toEqual({ id: "log_1", version: 3 });
    await userEvent.click(await screen.findByRole("button", { name: "Disable central" }));
    await waitFor(() => expect(port.update).toHaveBeenCalledTimes(2));
    expect(port.update.mock.calls[1]?.[2]).toEqual({ enabled: false });
    await userEvent.click(await screen.findByRole("button", { name: "Delete central" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(port.delete).toHaveBeenCalledWith("team_1", { id: "log_1", version: 3 }),
    );
  });
});

describe("T14 log delivery permissions (M4-L2)", () => {
  it("a viewer reads the destinations with every change disabled naming the role", async () => {
    const port = open(VIEWER);
    expect(await screen.findByText("central")).toBeTruthy();
    for (const name of ["Add destination", "Disable central", "Edit central", "Delete central"]) {
      const b = screen.getByRole("button", { name });
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.getAttribute("aria-describedby")).toBeTruthy();
    }
    await userEvent.hover(screen.getByRole("button", { name: "Add destination" }));
    expect(await screen.findByText("Requires team-admin")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add destination" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(port.create).not.toHaveBeenCalled();
  });
  it("shows the API's access denied when a create is forced", async () => {
    const port = fakeLogDestinationsPort();
    port.create.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires logs:write", requestId: "r1" }),
    );
    open(SERVICE_ADMIN, port);
    await userEvent.click(await screen.findByRole("button", { name: "Add destination" }));
    const d = screen.getByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "x");
    await userEvent.type(within(d).getByLabelText("Log group"), "/a");
    await userEvent.type(within(d).getByLabelText("Region"), "eu-west-1");
    await userEvent.click(within(d).getByRole("button", { name: "Add destination" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
