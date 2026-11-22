import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import {
  aChannel,
  fakeNotificationsPort,
  notificationsServices,
} from "../../testing/notifications.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T14 from "./index.js";

function open(me: Me = TEAM_ADMIN, port = fakeNotificationsPort()) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam());
  renderScreen(<T14 />, {
    me,
    services: { ...notificationsServices(port), ...teamsServices(teams) },
    path: "/t/team_1/delivery/notifications",
    route: "/t/:teamId/delivery/notifications",
  });
  return port;
}

describe("T14 notifications (M3-N1, M3-N4)", () => {
  it("lists channels with kind, events and delivery status", async () => {
    open();
    expect(await screen.findByText("alerts")).toBeTruthy();
    expect(screen.getByText("Slack")).toBeTruthy();
    expect(screen.getByText("budget.*")).toBeTruthy();
    expect(screen.getByText("Delivering")).toBeTruthy();
  });
  it("shows a failed delivery with its error on the channel", async () => {
    open(
      TEAM_ADMIN,
      fakeNotificationsPort({
        list: async () => [
          aChannel({
            delivery: {
              healthy: false,
              lastDeliveredAt: undefined,
              lastFailureAt: "2026-11-21T10:00:00Z",
              lastError: "invalid_auth",
              lastTestId: undefined,
            },
          }),
        ],
      }),
    );
    expect(await screen.findByText("Failing")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("invalid_auth");
  });
  it("creates a channel, refusing a missing secret first", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add channel" }));
    const d = screen.getByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "ops");
    await userEvent.type(within(d).getByLabelText("Slack channel"), "#ops");
    await userEvent.click(within(d).getByRole("button", { name: "Add channel" }));
    expect(await within(d).findByText(/Choose the secret/)).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
  });
  it("edits a channel with the version it read", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit alerts" }));
    const d = screen.getByRole("dialog");
    const name = within(d).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "alerts2");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(port.update).toHaveBeenCalled());
    expect(port.update.mock.calls[0]?.[1]).toEqual({ id: "nch_1", version: 3 });
  });
});

describe("T14 send test (M3-N2)", () => {
  it("shows a delivered test", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Send test to alerts" }));
    expect(await screen.findByText("Test delivered")).toBeTruthy();
  });
  it("shows a failed test with its error", async () => {
    open(
      TEAM_ADMIN,
      fakeNotificationsPort({
        test: async () => ({
          testId: "t",
          delivered: false,
          pending: false,
          error: "channel_not_found",
        }),
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Send test to alerts" }));
    expect(await screen.findByText(/channel_not_found/)).toBeTruthy();
  });
});

describe("T14 delete (M3-N3)", () => {
  it("lists the report schedules that deliver to the channel before deleting", async () => {
    const port = open(
      TEAM_ADMIN,
      fakeNotificationsPort({
        schedules: async () => [{ id: "rs_1", name: "Weekly spend", channelId: "nch_1" }],
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete alerts" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText("Weekly spend")).toBeTruthy();
    await userEvent.click(within(d).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(port.delete).toHaveBeenCalled());
  });
});

describe("T14 permissions (M3-N5)", () => {
  it("a viewer sees the channels with create, test, edit and delete disabled naming the role", async () => {
    const port = open(VIEWER);
    expect(await screen.findByText("alerts")).toBeTruthy();
    for (const name of ["Add channel", "Send test to alerts", "Edit alerts", "Delete alerts"]) {
      const b = screen.getByRole("button", { name });
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(b.getAttribute("aria-describedby")).toBeTruthy();
    }
    await userEvent.hover(screen.getByRole("button", { name: "Add channel" }));
    expect(await screen.findByText("Requires team-admin")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add channel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(port.create).not.toHaveBeenCalled();
  });
  it("shows the API's access denied when a save is forced", async () => {
    const port = fakeNotificationsPort();
    port.update.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires team_admin", requestId: "r1" }),
    );
    open(SERVICE_ADMIN, port);
    await userEvent.click(await screen.findByRole("button", { name: "Edit alerts" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
  it("is not found with no notifications permission", async () => {
    open({ ...VIEWER, permissions: [], teams: [] } as never);
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
