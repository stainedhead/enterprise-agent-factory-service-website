import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { aReport, fakeReportsPort, reportsServices } from "../../testing/reports.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T11 from "./index.js";

function open(me: Me = TEAM_ADMIN, port = fakeReportsPort(), path = "/t/team_1/reports") {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam());
  renderScreen(<T11 />, {
    me,
    services: { ...reportsServices(port), ...teamsServices(teams) },
    path,
    route: "/t/:teamId/reports",
  });
  return port;
}

describe("T11 team reports (M3-R1)", () => {
  it("runs the cost report with controls, summary, chart and table", async () => {
    const port = open();
    expect(await screen.findByText("$15.75")).toBeTruthy();
    expect(screen.getByText("Data table")).toBeTruthy();
    expect((await screen.findAllByText("claude-haiku")).length).toBeGreaterThan(0);
    expect(port.run).toHaveBeenCalledWith(
      { level: "team", teamId: "team_1" },
      "costs",
      expect.objectContaining({ range: "mtd" }),
      expect.anything(),
    );
  });
  it("downloads the CSV the API returns, unchanged", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(port.csv).toHaveBeenCalled());
  });
  it("shows the API's notes", async () => {
    open(
      TEAM_ADMIN,
      fakeReportsPort({ run: async () => aReport({ notes: ["Billed cost lags a day"] }) }),
    );
    expect(await screen.findByText("Billed cost lags a day")).toBeTruthy();
  });
  it("shows a failed run with its request id", async () => {
    const port = fakeReportsPort();
    port.run.mockRejectedValue(
      new AppError({ kind: "validation", message: "boom", requestId: "req_9" }),
    );
    open(TEAM_ADMIN, port);
    expect(await screen.findByText("The report could not be run")).toBeTruthy();
  });
});

describe("T11 tag keys failure (FR-019)", () => {
  function openWithFailingTags() {
    const teams = fakeTeamsPort();
    teams.get.mockResolvedValue(aTeam());
    teams.tags
      .mockRejectedValueOnce(
        new AppError({ kind: "unavailable", message: "tags down", requestId: "req_tags" }),
      )
      .mockResolvedValue({ tags: [{ key: "env", value: "prod" }] } as never);
    renderScreen(<T11 />, {
      me: TEAM_ADMIN,
      services: { ...reportsServices(fakeReportsPort()), ...teamsServices(teams) },
      path: "/t/team_1/reports",
      route: "/t/:teamId/reports",
    });
    return teams;
  }
  it("shows an inline alert with the request id, keeps the report, and Retry re-runs the query", async () => {
    const teams = openWithFailingTags();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Tag keys could not be loaded");
    expect(alert.textContent).toContain("req_tags");
    expect(await screen.findByText("$15.75")).toBeTruthy();
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(teams.tags).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
  it("shows no alert when the role cannot read tags (denied case)", async () => {
    const teams = fakeTeamsPort();
    teams.get.mockResolvedValue(aTeam());
    const noTags: Me = {
      ...VIEWER,
      teams: VIEWER.teams.map((t) => ({
        ...t,
        permissions: t.permissions.filter((p) => p !== "tags:read"),
      })),
    };
    renderScreen(<T11 />, {
      me: noTags,
      services: { ...reportsServices(fakeReportsPort()), ...teamsServices(teams) },
      path: "/t/team_1/reports",
      route: "/t/:teamId/reports",
    });
    expect(await screen.findByText("$15.75")).toBeTruthy();
    expect(teams.tags).not.toHaveBeenCalled();
    expect(screen.queryByText("Tag keys could not be loaded")).toBeNull();
  });
});

describe("T11 tag keys access denied by the API (FR-019)", () => {
  it("shows no inline alert; access denial is the API's answer and is handled elsewhere", async () => {
    const teams = fakeTeamsPort();
    teams.get.mockResolvedValue(aTeam());
    teams.tags.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "no", requestId: "req_403" }),
    );
    renderScreen(<T11 />, {
      me: TEAM_ADMIN,
      services: { ...reportsServices(fakeReportsPort()), ...teamsServices(teams) },
      path: "/t/team_1/reports",
      route: "/t/:teamId/reports",
    });
    expect(await screen.findByText("$15.75")).toBeTruthy();
    await waitFor(() => expect(teams.tags).toHaveBeenCalled());
    expect(screen.queryByText("Tag keys could not be loaded")).toBeNull();
  });
});

describe("T11 activity and external systems (M3-R2, M3-R3)", () => {
  it("summarises activity as utilization and longest idle", async () => {
    open(
      TEAM_ADMIN,
      fakeReportsPort({
        run: async () =>
          aReport({
            kind: "activity",
            groupBy: ["agent"],
            rows: [
              { agent: "agt_1", state: "working" },
              { agent: "agt_2", state: "idle", idleSeconds: 7200 },
            ],
            totals: {},
          }),
      }),
      "/t/team_1/reports?tab=activity",
    );
    expect(await screen.findByText("Utilization")).toBeTruthy();
    expect(screen.getByText("Longest idle")).toBeTruthy();
    expect(screen.getByText("2 h 00 min", { selector: "div" })).toBeTruthy();
  });
  it("traffic shows counts and bytes with no cost, and flags unmetered systems", async () => {
    open(
      TEAM_ADMIN,
      fakeReportsPort({
        run: async () =>
          aReport({
            kind: "traffic",
            groupBy: ["system"],
            rows: [{ system: "wiki", connections: 4, bytes: 2048, unmetered: true }],
            totals: { connections: 4, bytes: 2048 },
          }),
      }),
      "/t/team_1/reports?tab=external-systems",
    );
    expect(await screen.findByText("Unmetered systems")).toBeTruthy();
    expect(screen.getAllByText("Connections").length).toBeGreaterThan(0);
    expect(screen.queryByText("Spend")).toBeNull();
  });
});

describe("T11 permissions (M3-R5)", () => {
  it("a viewer can read the reports", async () => {
    open(VIEWER);
    expect(await screen.findByText("$15.75")).toBeTruthy();
  });
  it("someone with no reports permission in the team sees not found", async () => {
    open({ ...VIEWER, permissions: [], teams: [] } as unknown as Me);
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
  it("the service admin keeps the report", async () => {
    open(SERVICE_ADMIN);
    expect(await screen.findByText("$15.75")).toBeTruthy();
  });
});

describe("T11 collaboration report (WEB-US-59)", () => {
  const collab = () =>
    aReport({
      kind: "collaboration",
      groupBy: ["person"],
      rows: [
        {
          person: { id: "usr_1", type: "user", label: "Ada Admin" },
          signIns: 4,
          uniquePeople: 1,
          requests: 20,
          deniedRequests: 2,
          secretDetections: 0,
          serviceAdminEntry: true,
        },
        {
          person: { id: "key_1", type: "api_key" },
          signIns: 0,
          uniquePeople: 1,
          requests: 5,
          deniedRequests: 0,
          secretDetections: 1,
        },
      ],
      totals: { signIns: 4, requests: 25 },
    });

  it("opens from the Recent access link with the range and grouping it names", async () => {
    const port = fakeReportsPort();
    port.run.mockResolvedValue(collab());
    open(TEAM_ADMIN, port, "/t/team_1/reports?tab=collaboration&range=7d&groupBy=person");
    expect(await screen.findByText("Ada Admin")).toBeTruthy();
    expect(screen.getByText("key_1 (API key)")).toBeTruthy();
    expect(screen.getByText("Service admin entry", { selector: "span,div" })).toBeTruthy();
    expect(port.run).toHaveBeenCalledWith(
      { level: "team", teamId: "team_1" },
      "collaboration",
      expect.objectContaining({ range: "7d", groupBy: ["person"] }),
      expect.anything(),
    );
  });
  it("offers day, surface, reason and person groupings and no schedule action", async () => {
    open(
      TEAM_ADMIN,
      fakeReportsPort({ run: async () => collab() }),
      "/t/team_1/reports?tab=collaboration",
    );
    await screen.findByRole("button", { name: "Download CSV" });
    const group = screen.getByRole("combobox", { name: /group by/i });
    const labels = within(group)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(["Day", "Surface", "Reason", "Person"]));
    expect(screen.queryByRole("button", { name: /schedule report/i })).toBeNull();
  });
  it("ignores a grouping the report does not offer", async () => {
    const port = fakeReportsPort();
    port.run.mockResolvedValue(collab());
    open(TEAM_ADMIN, port, "/t/team_1/reports?tab=collaboration&groupBy=bogus");
    await screen.findByRole("button", { name: "Download CSV" });
    expect(port.run).toHaveBeenCalledWith(
      expect.anything(),
      "collaboration",
      expect.objectContaining({ groupBy: ["day"] }),
      expect.anything(),
    );
  });
});
