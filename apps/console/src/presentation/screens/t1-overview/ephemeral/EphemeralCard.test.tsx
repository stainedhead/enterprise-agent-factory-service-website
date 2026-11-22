import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../application/errors.js";
import type { OverviewPort } from "../../../../application/ports/overview.js";
import { OverviewUseCases } from "../../../../application/usecases/overview/OverviewUseCases.js";
import { ephemeralStatus } from "../../../../application/usecases/teams/ephemeral.js";
import type { Me } from "../../../../domain/me.js";
import { TEAM_ADMIN } from "../../../testing/harness.js";
import { renderScreen } from "../../../testing/screen.js";
import {
  ALL_PERMS,
  aTeam,
  fakeTeamsPort,
  serviceAdminWith,
  teamsServices,
} from "../../../testing/teams.js";
import T1 from "../index.js";

function open(team = aTeam(), budget?: OverviewPort["budget"], me = serviceAdminWith(ALL_PERMS)) {
  const port: OverviewPort = {
    budget:
      budget ??
      vi.fn(async () => ({
        amountUsd: "2000.00",
        spentUsd: "500.00",
        reservedUsd: "0.00",
        period: "lifetime",
        onExhaust: "block",
        thresholds: [],
        version: 1,
      })),
    agents: vi.fn(async () => []),
    recentActivity: vi.fn(async () => []),
  };
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(team);
  renderScreen(<T1 />, {
    me,
    services: {
      ...teamsServices(teams),
      overview: new OverviewUseCases(port, { listForTeam: async () => ({ items: [] }) }),
    },
    path: "/t/team_1",
    route: "/t/:teamId/*",
  });
}

describe("ephemeralStatus", () => {
  it("counts days up and reports teardown", () => {
    const now = new Date("2026-11-22T00:00:00Z");
    expect(
      ephemeralStatus({ state: "active", expiresAt: "2026-12-01T00:00:00Z" }, now).daysLeft,
    ).toBe(9);
    expect(
      ephemeralStatus({ state: "active", expiresAt: "2026-11-01T00:00:00Z" }, now).daysLeft,
    ).toBe(0);
    const s = ephemeralStatus(
      { state: "deleted", tornDownAt: "2026-11-20T00:00:00Z", teardownReason: "cap_reached" },
      now,
    );
    expect(s).toMatchObject({ tornDown: true, reason: "The lifetime budget cap was reached" });
  });
});

describe("T1 ephemeral card (M5-E3)", () => {
  it("shows expiry, spend against the cap and the teardown rule", async () => {
    open(
      aTeam({
        kind: "ephemeral",
        expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        teardownRule: "at_cap_or_expiry",
      }),
    );
    const card = await screen.findByRole("region", { name: "Ephemeral team" });
    expect(card.textContent).toContain("5 days left");
    await vi.waitFor(() => expect(card.textContent).toContain("$500.00 of $2,000.00 (25%)"));
    expect(card.textContent).toContain("whichever comes first");
  });
  it("after teardown shows when and why", async () => {
    open(
      aTeam({
        kind: "ephemeral",
        state: "deleted",
        expiresAt: "2026-11-20T00:00:00Z",
        tornDownAt: "2026-11-19T10:00:00Z",
        teardownReason: "cap_reached",
      }),
    );
    const card = await screen.findByRole("region", { name: "Ephemeral team" });
    expect(card.textContent).toContain("Torn down");
    expect(card.textContent).toContain("The lifetime budget cap was reached");
  });
  it("shows an inline error with the request id and Retry when the budget fails (FR-019)", async () => {
    const budget = vi
      .fn<OverviewPort["budget"]>()
      .mockRejectedValue(
        new AppError({ kind: "validation", message: "budget broken", requestId: "req_burn" }),
      );
    open(
      aTeam({ kind: "ephemeral", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString() }),
      budget,
    );
    const card = await screen.findByRole("region", { name: "Ephemeral team" });
    const alert = await within(card).findByRole("alert");
    expect(alert.textContent).toContain("The budget burn could not be loaded");
    expect(alert.textContent).toContain("req_burn");
    expect(card.textContent).toContain("5 days left");
    expect(card.textContent).not.toContain("Loading…");
    budget.mockResolvedValue({
      amountUsd: "2000.00",
      spentUsd: "500.00",
      reservedUsd: "0.00",
      period: "lifetime",
      onExhaust: "block",
      thresholds: [],
      version: 1,
    });
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await vi.waitFor(() => expect(card.textContent).toContain("$500.00 of $2,000.00 (25%)"));
    expect(within(card).queryByRole("alert")).toBeNull();
  });
  it("makes no budget call and shows no alert without budgets:read (denied case)", async () => {
    const budget = vi.fn<OverviewPort["budget"]>();
    const me: Me = {
      ...TEAM_ADMIN,
      teams: TEAM_ADMIN.teams.map((t) => ({
        ...t,
        permissions: t.permissions.filter((p) => p !== "budgets:read"),
      })),
    };
    open(
      aTeam({ kind: "ephemeral", expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString() }),
      budget,
      me,
    );
    const card = await screen.findByRole("region", { name: "Ephemeral team" });
    expect(card.textContent).toContain("You cannot view the budget");
    expect(budget).not.toHaveBeenCalled();
    expect(within(card).queryByRole("alert")).toBeNull();
  });
  it("is absent for a persistent team", async () => {
    open();
    await screen.findByRole("heading", { name: /^Alpha/ });
    expect(screen.queryByRole("region", { name: "Ephemeral team" })).toBeNull();
  });
});
