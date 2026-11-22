import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { createQueryClient } from "../../query/createQueryClient.js";
import { ServicesContext } from "../../services.js";
import { MeProvider } from "../../shell/ShellContext.js";
import { budgetsServices, fakeBudgetsPort } from "../../testing/budgets.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T5 from "./index.js";

function open(me: Me = TEAM_ADMIN, port = fakeBudgetsPort(), team = aTeam()) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(team);
  renderScreen(<T5 />, {
    me,
    services: { ...budgetsServices(port), ...teamsServices(teams) },
    path: "/t/team_1/budget",
    route: "/t/:teamId/budget",
  });
  return port;
}

describe("T5 budget and usage (M3-B1)", () => {
  it("shows month to date, forecast with the cap date, the action, reconciliation and agents", async () => {
    open();
    expect(await screen.findByText("$820.00")).toBeTruthy();
    expect(screen.getByText(/82% of \$1,000\.00 · ceiling \$1,000\.00/)).toBeTruthy();
    expect(screen.getByText("$1,180.00")).toBeTruthy();
    expect(screen.getByText(/Projected to hit cap on 27 Nov/)).toBeTruthy();
    expect(screen.getByText("Block calls")).toBeTruthy();
    expect(screen.getByText("Reconciled (2 Nov)")).toBeTruthy();
    expect(screen.getByText(/Variance \+0\.83%/)).toBeTruthy();
    expect(screen.getByText("agt_1")).toBeTruthy();
    expect(screen.getByText("410 M")).toBeTruthy();
    // daily spend has both series and a table alternative
    expect(
      screen.getByText("Bedrock tokens (gateway, real time)", { selector: "li" }),
    ).toBeTruthy();
    expect(screen.getByText("Data table")).toBeTruthy();
  });
  it("says so before billed cost has arrived", async () => {
    open(
      TEAM_ADMIN,
      fakeBudgetsPort({
        costs: async () => [{ day: "2026-11-01", source: "gateway", costUsd: "1.00" }],
      }),
    );
    expect(await screen.findByText(/Not reconciled yet/)).toBeTruthy();
  });
  it("downloads the usage CSV the API returns", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(port.usageCsv).toHaveBeenCalled());
  });
});

describe("T5 edit budget (M3-B2, M3-B3, M3-B4)", () => {
  it("refuses an amount above the ceiling naming it, then saves with the version", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Edit budget" }));
    const d = await screen.findByRole("dialog");
    const amount = within(d).getByLabelText("Amount (USD)");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1500.00");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    expect(await within(d).findByText(/above the team's ceiling of \$1,000\.00/)).toBeTruthy();
    expect(port.put).not.toHaveBeenCalled();
    await userEvent.clear(amount);
    await userEvent.type(amount, "900.00");
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(port.put).toHaveBeenCalledWith("team_1", 4, {
        amountUsd: "900.00",
        period: "monthly",
        thresholds: [50, 80, 100],
        onExhaust: "block",
      }),
    );
  });
  it("shows the API's ValidationError on the field", async () => {
    const port = fakeBudgetsPort({
      put: async () => {
        throw new AppError({
          kind: "validation",
          message: "bad",
          fields: { thresholds: "Must ascend" },
        });
      },
    });
    open(TEAM_ADMIN, port);
    await userEvent.click(await screen.findByRole("button", { name: "Edit budget" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    expect(await screen.findByText("Must ascend")).toBeTruthy();
  });
  it("offers the action at exhaustion only to service admins on persistent teams", async () => {
    open(SERVICE_ADMIN);
    await userEvent.click(await screen.findByRole("button", { name: "Edit budget" }));
    expect(within(await screen.findByRole("dialog")).getByLabelText("At exhaustion")).toBeTruthy();
  });
  it("a team-admin is not offered the action, ceiling or guardrails; a forced 403 is shown", async () => {
    const port = fakeBudgetsPort({
      put: async () => {
        throw new AppError({
          kind: "access-denied",
          message: "Requires service admin",
          requestId: "req_budget_403",
          requiredPermission: "budgets:write",
        });
      },
    });
    open(TEAM_ADMIN, port);
    expect(screen.queryByText("Guardrails")).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "Edit budget" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).queryByLabelText("At exhaustion")).toBeNull();
    await userEvent.click(within(d).getByRole("button", { name: "Save" }));
    // FR-002: the denial names the permission and the request id, and the dialog stays open
    expect((await within(d).findByText(/It requires/)).textContent).toContain("budgets:write");
    expect(within(d).getByText(/Request id: req_budget_403/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("service admins get a link to the guardrails; everyone with access gets the notifications link", async () => {
    open(SERVICE_ADMIN);
    expect(await screen.findByRole("link", { name: "Ceiling, override and quotas" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Notification channels" }).getAttribute("href")).toBe(
      "/t/team_1/delivery/notifications",
    );
  });
  it("is read-only for a viewer, naming the role", async () => {
    open(VIEWER);
    const b = await screen.findByRole("button", { name: "Edit budget" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await userEvent.hover(b);
    expect(await screen.findByText("Requires team-admin")).toBeTruthy();
  });
  it("is disabled for a suspended team", async () => {
    open(TEAM_ADMIN, fakeBudgetsPort(), aTeam({ state: "suspended" }));
    const b = await screen.findByRole("button", { name: "Edit budget" });
    await waitFor(() => expect(b.getAttribute("aria-disabled")).toBe("true"));
  });
});

describe("FR-002 the budget dialog reports a denial to the shell", () => {
  it("routes an AccessDenied from the versioned form to the shared reporter", async () => {
    const onDenied = vi.fn();
    const port = fakeBudgetsPort({
      put: async () => {
        throw new AppError({
          kind: "access-denied",
          message: "no",
          requiredPermission: "budgets:write",
        });
      },
    });
    const teams = fakeTeamsPort();
    teams.get.mockResolvedValue(aTeam());
    const qc = createQueryClient(onDenied);
    render(
      <QueryClientProvider client={qc}>
        <ServicesContext.Provider value={{ ...budgetsServices(port), ...teamsServices(teams) }}>
          <MeProvider value={TEAM_ADMIN}>
            <MemoryRouter initialEntries={["/t/team_1/budget"]}>
              <Routes>
                <Route path="/t/:teamId/budget" element={<T5 />} />
              </Routes>
            </MemoryRouter>
          </MeProvider>
        </ServicesContext.Provider>
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Edit budget" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Save" }),
    );
    await waitFor(() => expect(onDenied).toHaveBeenCalledTimes(1));
    expect(onDenied.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
  });
});
