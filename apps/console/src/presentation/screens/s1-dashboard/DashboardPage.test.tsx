import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { DashboardPort } from "../../../application/ports/dashboard.js";
import type { OverviewPort } from "../../../application/ports/overview.js";
import { DashboardUseCases } from "../../../application/usecases/dashboard/DashboardUseCases.js";
import { TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { ALL_PERMS, aTeam, fakeTeamsPort, serviceAdminWith, status } from "../../testing/teams.js";
import S1 from "./index.js";

const NOW = Date.parse("2026-11-22T12:00:00Z");

function open(
  o: {
    teams?: ReturnType<typeof fakeTeamsPort>;
    dash?: Partial<DashboardPort>;
    agents?: OverviewPort["agents"];
    me?: ReturnType<typeof serviceAdminWith>;
  } = {},
) {
  const teams =
    o.teams ??
    fakeTeamsPort({
      list: vi.fn(async () => ({
        items: [
          aTeam({ id: "team_1", slug: "alpha", displayName: "Alpha" }),
          aTeam({
            id: "team_2",
            slug: "beta",
            displayName: "Beta",
            kind: "ephemeral",
            expiresAt: new Date(NOW + 2 * 86_400_000).toISOString(),
          }),
        ],
      })),
      spendByTeam: vi.fn(async () => ({
        team_1: { costUsd: "900.00" },
        team_2: { costUsd: "100.00" },
      })),
    });
  const port: DashboardPort = {
    readiness: vi.fn(async () => ({ status: "ok", checks: { database: "ok", reconciler: "ok" } })),
    varianceDays: vi.fn(async () => ({ count: 2, more: false })),
    pendingProposals: vi.fn(async () => ({ count: 1, more: false })),
    ...o.dash,
  };
  const overview = {
    agents:
      o.agents ??
      vi.fn(async (teamId: string) =>
        teamId === "team_1"
          ? [
              {
                id: "a1",
                name: "reviewer",
                paused: false,
                status: status(),
                iamIdentity: "dedicated",
              },
              {
                id: "a2",
                name: "triage",
                paused: false,
                status: status("Degraded"),
                iamIdentity: "dedicated",
              },
            ]
          : [],
      ),
  } as unknown as OverviewPort;
  renderScreen(<S1 />, {
    me: o.me ?? serviceAdminWith(ALL_PERMS),
    services: { dashboard: new DashboardUseCases(teams, overview, port, { now: () => NOW }) },
    path: "/",
  });
  return { teams, port, overview };
}

describe("S1 dashboard (M1-D1..D3)", () => {
  it("shows counts, spend against budgets, health and the top spenders linking to teams", async () => {
    open();
    expect(await screen.findByText(/of \$2,000\.00 in budgets \(50%\)/)).toBeTruthy();
    expect(screen.getByText(/2 active, 0 suspended, 1 ephemeral/)).toBeTruthy();
    expect(await screen.findByText(/^1 degraded$/)).toBeTruthy();
    expect(await screen.findByText("Healthy")).toBeTruthy();
    const top = within(screen.getByRole("region", { name: "Top spenders this month" }));
    const link = (await top.findByRole("link", { name: "Alpha" })) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/t/team_1");
  });

  it("lists teams needing attention with every reason and a link", async () => {
    open();
    const card = within(await screen.findByRole("region", { name: "Teams needing attention" }));
    expect(await card.findByText(/1 degraded agent: triage/)).toBeTruthy();
    const alpha = card.getByRole("link", { name: "Alpha" }).closest("tr") as HTMLElement;
    expect(within(alpha).getByText(/90% of budget used/)).toBeTruthy();
    const beta = card.getByRole("link", { name: "Beta" }).closest("tr") as HTMLElement;
    expect(within(beta).getByText(/Expires in 2 day/)).toBeTruthy();
  });

  it("warns about variance and pending proposals with links to S8 and S4", async () => {
    open();
    const v = await screen.findByText(/2 team-days are over the variance threshold/);
    expect(
      within(v.closest("[role=alert]") as HTMLElement)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/reports/reconciliation");
    const p = await screen.findByText(/1 model price proposal is waiting/);
    expect(
      within(p.closest("[role=alert]") as HTMLElement)
        .getByRole("link")
        .getAttribute("href"),
    ).toBe("/models");
  });

  it("shows no warning when nothing is over or pending", async () => {
    open({
      dash: {
        varianceDays: async () => ({ count: 0, more: false }),
        pendingProposals: async () => ({ count: 0, more: false }),
      },
    });
    await screen.findByText("Healthy");
    expect(screen.queryByText(/variance threshold/)).toBeNull();
    expect(screen.queryByText(/price proposal/)).toBeNull();
  });

  it("isolates a failing widget: agents fail while spend and teams still render", async () => {
    open({
      agents: vi.fn(async () => {
        throw new AppError({ kind: "validation", message: "boom" });
      }),
    });
    expect(await screen.findByText(/in budgets/)).toBeTruthy();
    expect(await screen.findByText(/Agents could not be loaded/)).toBeTruthy();
    expect(screen.getByText(/2 active/)).toBeTruthy();
  });

  it("denied: without reports and pricing permissions nothing is requested for them", async () => {
    const { teams, port } = open({ me: serviceAdminWith(["teams:read-directory"]) });
    await screen.findByText(/2 active/);
    await waitFor(() => expect(port.readiness).toHaveBeenCalled());
    expect(teams.spendByTeam).not.toHaveBeenCalled();
    expect(port.varianceDays).not.toHaveBeenCalled();
    expect(port.pendingProposals).not.toHaveBeenCalled();
    expect(screen.getByText("You cannot view spend.")).toBeTruthy();
  });

  it("denied: a caller with no service permissions requests no team list", async () => {
    const { teams } = open({ me: TEAM_ADMIN as never });
    await screen.findByText("Reconciler health");
    expect(teams.list).not.toHaveBeenCalled();
  });
});
