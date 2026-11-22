import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { OverviewPort } from "../../../../application/ports/overview.js";
import { OverviewUseCases } from "../../../../application/usecases/overview/OverviewUseCases.js";
import { ephemeralStatus } from "../../../../application/usecases/teams/ephemeral.js";
import { renderScreen } from "../../../testing/screen.js";
import {
  ALL_PERMS,
  aTeam,
  fakeTeamsPort,
  serviceAdminWith,
  teamsServices,
} from "../../../testing/teams.js";
import T1 from "../index.js";

function open(team = aTeam()) {
  const port: OverviewPort = {
    budget: vi.fn(async () => ({
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
    me: serviceAdminWith(ALL_PERMS),
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
  it("is absent for a persistent team", async () => {
    open();
    await screen.findByRole("heading", { name: /^Alpha/ });
    expect(screen.queryByRole("region", { name: "Ephemeral team" })).toBeNull();
  });
});
