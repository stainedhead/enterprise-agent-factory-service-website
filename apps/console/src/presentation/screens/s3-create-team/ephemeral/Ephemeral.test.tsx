import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  emptyEphemeral,
  estimate,
  expiryTimestamp,
  validateEphemeral,
} from "../../../../application/usecases/teams/ephemeral.js";
import { SERVICE_ADMIN } from "../../../testing/harness.js";
import { renderScreen } from "../../../testing/screen.js";
import { fakeTeamsPort, teamsServices } from "../../../testing/teams.js";
import { CreateTeamPage } from "../CreateTeamPage.js";

const NOW = new Date("2026-11-22T00:00:00Z");
const draft = (over = {}) => ({ ...emptyEphemeral(), ...over });
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe("ephemeral rules (M5-E1, M5-E2)", () => {
  it("needs a budget, an expiry inside the maximum and a teardown rule (default at cap or expiry)", () => {
    expect(draft().teardownRule).toBe("at_cap_or_expiry");
    const e = validateEphemeral("", draft(), 90, NOW);
    expect(Object.keys(e).sort()).toEqual(["expiresOn", "maxBudgetUsd"]);
    expect(validateEphemeral("2000.00", draft({ expiresOn: "2026-12-15" }), 90, NOW)).toEqual({});
    expect(
      validateEphemeral("2000.00", draft({ expiresOn: "2026-11-21" }), 90, NOW).expiresOn,
    ).toContain("future");
    expect(
      validateEphemeral("2000.00", draft({ expiresOn: "2027-06-01" }), 90, NOW).expiresOn,
    ).toContain("90 days");
    expect(
      validateEphemeral("2000.00", draft({ expiresOn: "nope" }), 90, NOW).expiresOn,
    ).toBeTruthy();
  });
  it("converts the day to a timestamp", () => {
    expect(expiryTimestamp("2026-12-15")).toBe("2026-12-15T00:00:00Z");
    expect(expiryTimestamp("")).toBeUndefined();
  });
  it("estimates the daily cost and the date the cap is reached", () => {
    const x = estimate("2000.00", draft({ expiresOn: "2026-12-15", dailyCostUsd: "60.00" }), NOW);
    expect(x).toMatchObject({
      dailyUsd: "60.00",
      capDays: 34,
      capDate: "2026-12-26",
      afterExpiry: true,
    });
    const y = estimate("2000.00", draft({ expiresOn: "2026-12-22" }), NOW);
    expect(y?.capDays).toBe(30);
    expect(y?.afterExpiry).toBe(false);
    expect(estimate("", draft({ expiresOn: "2026-12-22" }), NOW)).toBeUndefined();
  });
});

describe("S3 ephemeral budget step", () => {
  async function toBudget() {
    const port = fakeTeamsPort({ serviceTags: vi.fn(async () => []) });
    renderScreen(<CreateTeamPage />, {
      me: SERVICE_ADMIN,
      services: teamsServices(port),
      path: "/teams/new",
      route: "/teams/new",
    });
    await userEvent.type(screen.getByLabelText("Display name"), "POC");
    await userEvent.type(screen.getByLabelText("Slug"), "poc-team");
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "ephemeral");
    const next = () => screen.getByRole("button", { name: /^(Next|Review)$/ });
    await userEvent.click(next());
    await userEvent.click(await screen.findByLabelText(/Model One/));
    await userEvent.click(next());
    return { port, next };
  }

  it("keeps Next disabled until budget and expiry are set, shows the estimate, sends them", async () => {
    const { port, next } = await toBudget();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    await userEvent.type(screen.getByLabelText("Lifetime budget (USD)"), "2000.00");
    expect(next().getAttribute("aria-disabled")).toBe("true");
    await userEvent.type(screen.getByLabelText("Expires"), inDays(20));
    expect(next().getAttribute("aria-disabled")).toBeNull();
    expect(screen.getByRole("region", { name: "Estimate" }).textContent).toContain(
      "cap would be reached in 20 days",
    );
    await userEvent.click(next());
    await userEvent.type(screen.getByLabelText("Admin email"), "lead@example.com");
    await userEvent.click(next());
    expect(screen.getByText("Lifetime budget")).toBeTruthy();
    expect(screen.getByText("At expiry or cap, whichever first")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Create team" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(port.create.mock.calls[0]?.[0]).toMatchObject({
      kind: "ephemeral",
      teardownRule: "at_cap_or_expiry",
      budget: { amountUsd: "2000.00", period: "lifetime" },
    });
  });
});
