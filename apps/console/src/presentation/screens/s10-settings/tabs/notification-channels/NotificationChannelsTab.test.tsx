import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../../../application/errors.js";
import type { Me } from "../../../../../domain/me.js";
import {
  adminNotificationChannelsServices,
  fakeAdminNotificationChannelsPort,
} from "../../../../testing/adminNotificationChannels.js";
import { renderScreen } from "../../../../testing/screen.js";
import { ALL_PERMS, serviceAdminWith } from "../../../../testing/teams.js";
import S10 from "../../index.js";

function open(me: Me = serviceAdminWith(ALL_PERMS), port = fakeAdminNotificationChannelsPort()) {
  renderScreen(<S10 />, {
    me,
    services: adminNotificationChannelsServices(port),
    path: "/settings/notification-channels",
    route: "/settings/:section",
  });
  return port;
}

describe("S10 notification channels (M4-N1)", () => {
  it("lists the service channels", async () => {
    open();
    expect(await screen.findByText("ops-email")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Notification channels", selected: true })).toBeTruthy();
  });
  it("adds an email channel, refusing a missing recipient first", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add channel" }));
    const d = screen.getByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Name"), "billing");
    await userEvent.click(within(d).getByRole("button", { name: "Add channel" }));
    expect(await within(d).findByText(/Enter the Recipients/)).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
    await userEvent.type(within(d).getByLabelText("Recipients"), "fin@example.test");
    await userEvent.click(within(d).getByRole("button", { name: "Add channel" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(port.create.mock.calls[0]?.[0]).toMatchObject({
      kind: "email",
      config: { to: "fin@example.test" },
    });
  });
  it("offers only email, Slack, webhook and Jira", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Add channel" }));
    const opts = within(screen.getByLabelText("Kind"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(opts).toEqual(["Email", "Slack", "Webhook", "Jira"]);
  });
  it("edits with the version it read and toggles", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit ops-email" }));
    const name = within(screen.getByRole("dialog")).getByLabelText("Name");
    await userEvent.clear(name);
    await userEvent.type(name, "ops2");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(port.update).toHaveBeenCalled());
    expect(port.update.mock.calls[0]?.[0]).toEqual({ id: "nch_9", version: 3 });
    await userEvent.click(await screen.findByRole("button", { name: "Disable ops-email" }));
    await waitFor(() => expect(port.update).toHaveBeenCalledTimes(2));
  });
  it("shows the API's 409 when the channel is named by work orders", async () => {
    const port = fakeAdminNotificationChannelsPort();
    port.delete.mockRejectedValue(
      new AppError({
        kind: "conflict",
        message: "work_orders.notification_channel_id uses this channel",
        requestId: "r",
      }),
    );
    open(serviceAdminWith(ALL_PERMS), port);
    await userEvent.click(await screen.findByRole("button", { name: "Delete ops-email" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    expect(await screen.findByText("The channel is in use")).toBeTruthy();
    expect(screen.getByText(/work_orders.notification_channel_id/)).toBeTruthy();
    expect(screen.getByText(/Disable the channel instead/)).toBeTruthy();
  });
  it("without admin:settings the section is not found and nothing is read", async () => {
    const port = open(serviceAdminWith(ALL_PERMS.filter((p) => p !== "admin:settings")));
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(port.list).not.toHaveBeenCalled();
  });
  it("shows the API's access denied when a change is forced", async () => {
    const port = fakeAdminNotificationChannelsPort();
    port.update.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires admin:settings", requestId: "r" }),
    );
    open(serviceAdminWith(ALL_PERMS), port);
    await userEvent.click(await screen.findByRole("button", { name: "Disable ops-email" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
