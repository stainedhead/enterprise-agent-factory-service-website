import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../../application/errors.js";
import type { Me } from "../../../../domain/me.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../../testing/harness.js";
import {
  aChannel,
  fakeNotificationsPort,
  notificationsServices,
} from "../../../testing/notifications.js";
import {
  aSchedule,
  fakeReportSchedulesPort,
  reportSchedulesServices,
} from "../../../testing/reportSchedules.js";
import { fakeReportsPort, reportsServices } from "../../../testing/reports.js";
import { renderScreen } from "../../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../../testing/teams.js";
import T11 from "../index.js";

function open(me: Me = TEAM_ADMIN, port = fakeReportSchedulesPort(), path = "/t/team_1/reports") {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam());
  renderScreen(<T11 />, {
    me,
    services: {
      ...reportsServices(fakeReportsPort()),
      ...reportSchedulesServices(port),
      ...notificationsServices(fakeNotificationsPort()),
      ...teamsServices(teams),
    },
    path,
    route: "/t/:teamId/reports",
  });
  return port;
}

describe("T11 schedule report (M4-S1)", () => {
  it("schedules the report as configured, to a team channel with a cadence", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Schedule report" }));
    const d = await screen.findByRole("dialog", { name: "Schedule report" });
    await userEvent.selectOptions(within(d).getByLabelText("Cadence"), "monthly");
    await within(d).findByRole("option", { name: "alerts" });
    await userEvent.selectOptions(within(d).getByLabelText("Channel"), "nch_1");
    await userEvent.click(within(d).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(port.create.mock.calls[0]?.[1]).toMatchObject({
      report: "costs",
      cadence: "monthly",
      channelId: "nch_1",
      query: expect.objectContaining({ range: "mtd" }),
    });
    expect(await screen.findByText(/Scheduled/)).toBeTruthy();
    expect(aChannel().id).toBe("nch_1");
  });
  it("refuses a missing channel before any request", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Schedule report" }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Schedule" }));
    expect(await within(d).findByText("Choose a channel to deliver to")).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
  });
  it("shows the API's ValidationError for a service-level channel on the channel field", async () => {
    const port = fakeReportSchedulesPort();
    port.create.mockRejectedValue(
      new AppError({
        kind: "validation",
        message: "Use one of the team's own channels",
        fields: { channelId: "Use one of the team's own channels" },
      }),
    );
    open(TEAM_ADMIN, port);
    await userEvent.click(await screen.findByRole("button", { name: "Schedule report" }));
    const d = await screen.findByRole("dialog");
    await within(d).findByRole("option", { name: "alerts" });
    await userEvent.selectOptions(within(d).getByLabelText("Channel"), "nch_1");
    await userEvent.click(within(d).getByRole("button", { name: "Schedule" }));
    expect(await within(d).findByText("Use one of the team's own channels")).toBeTruthy();
  });
  it("lists schedules with next run, last run, and a failed run's error", async () => {
    open(
      TEAM_ADMIN,
      fakeReportSchedulesPort({
        list: async () => [
          aSchedule(),
          aSchedule({ id: "rs_2", name: "Daily", lastStatus: "failed", lastError: "HTTP 401" }),
        ],
      }),
      "/t/team_1/reports?tab=schedules",
    );
    expect(await screen.findByText("Weekly spend")).toBeTruthy();
    expect(screen.getByText("Succeeded")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("HTTP 401");
  });
  it("pauses and deletes a schedule with the version it read", async () => {
    const port = open(TEAM_ADMIN, fakeReportSchedulesPort(), "/t/team_1/reports?tab=schedules");
    await userEvent.click(await screen.findByRole("button", { name: "Pause Weekly spend" }));
    await waitFor(() =>
      expect(port.update).toHaveBeenCalledWith(
        "team_1",
        { id: "rs_1", version: 2 },
        { enabled: false },
      ),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Delete Weekly spend" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(port.delete).toHaveBeenCalledWith("team_1", { id: "rs_1", version: 2 }),
    );
  });
});

describe("T11 schedule permissions (M4-S2)", () => {
  it("a viewer's Schedule report is disabled naming the role", async () => {
    const port = open(VIEWER);
    const b = await screen.findByRole("button", { name: "Schedule report" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await userEvent.hover(b);
    expect(await screen.findByText("Requires team-admin")).toBeTruthy();
    await userEvent.click(b);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(port.create).not.toHaveBeenCalled();
  });
  it("a viewer reads schedules with pause and delete disabled", async () => {
    open(VIEWER, fakeReportSchedulesPort(), "/t/team_1/reports?tab=schedules");
    for (const n of ["Pause Weekly spend", "Delete Weekly spend"])
      expect((await screen.findByRole("button", { name: n })).getAttribute("aria-disabled")).toBe(
        "true",
      );
  });
  it("shows the API's access denied when a schedule is forced", async () => {
    const port = fakeReportSchedulesPort();
    port.update.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires reports:schedule", requestId: "r" }),
    );
    open(SERVICE_ADMIN, port, "/t/team_1/reports?tab=schedules");
    await userEvent.click(await screen.findByRole("button", { name: "Pause Weekly spend" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
