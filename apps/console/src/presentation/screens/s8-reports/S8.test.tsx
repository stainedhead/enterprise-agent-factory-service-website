import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Me } from "../../../domain/me.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { fakeReportsPort, reportsServices } from "../../testing/reports.js";
import { renderScreen } from "../../testing/screen.js";
import S8 from "./index.js";

function open(me: Me, path = "/reports", port = fakeReportsPort()) {
  renderScreen(<S8 />, { me, services: reportsServices(port), path, route: "/reports/*" });
  return port;
}

describe("S8 service reports (M3-R4, M3-R5)", () => {
  it("runs the service cost report", async () => {
    const port = open(SERVICE_ADMIN);
    expect(await screen.findByText("$15.75")).toBeTruthy();
    expect(port.run).toHaveBeenCalledWith(
      { level: "service" },
      "costs",
      expect.anything(),
      expect.anything(),
    );
  });
  it("lists team-days over threshold on the Reconciliation tab, reached by its route", async () => {
    const port = open(SERVICE_ADMIN, "/reports/reconciliation");
    expect(await screen.findByText("team_1")).toBeTruthy();
    expect(screen.getByText("Over threshold", { selector: "td *, td" })).toBeTruthy();
    expect(screen.getByText("$27.10")).toBeTruthy();
    expect(port.reconciliations).toHaveBeenCalledWith("over_threshold", expect.anything());
  });
  it("switches the reconciliation filter", async () => {
    const port = open(SERVICE_ADMIN, "/reports/reconciliation");
    await screen.findByText("team_1");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "");
    expect(port.reconciliations).toHaveBeenLastCalledWith("", expect.anything());
  });
  it.each([
    ["a team admin", TEAM_ADMIN],
    ["a viewer", VIEWER],
  ])("is not found for %s", async (_n, me) => {
    const port = open(me);
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    expect(port.run).not.toHaveBeenCalled();
  });
});
