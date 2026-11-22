import { screen, waitFor } from "@testing-library/react";
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
