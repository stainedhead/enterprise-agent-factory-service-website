import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../application/errors.js";
import type { Me } from "../../domain/me.js";
import { fakeOrgAccountsPort, orgAccountsServices } from "../testing/adminOrgAccounts.js";
import { SERVICE_ADMIN, VIEWER } from "../testing/harness.js";
import { renderScreen } from "../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../testing/teams.js";
import { AwsAccountAccess } from "./AwsAccountAccess.js";

const teamAdmin = (extra: string[] = []): Me => ({
  principal: { id: "usr_t", type: "user", name: "Tia" },
  serviceAdmin: false,
  securityOperator: false,
  teams: [
    {
      teamId: "team_1",
      slug: "alpha",
      role: "team_admin",
      permissions: ["teams:read", "teams:write", "identities:read", ...extra] as never,
    },
  ],
});

function open(me: Me = SERVICE_ADMIN, team = aTeam({ allowedAwsAccounts: ["*-payments"] })) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(team);
  const org = fakeOrgAccountsPort();
  renderScreen(<AwsAccountAccess teamId="team_1" />, {
    me,
    services: { ...orgAccountsServices(org), ...teamsServices(teams) },
    path: "/x",
    route: "/x",
  });
  return { teams, org };
}

describe("AwsAccountAccess (M4-W1)", () => {
  it("lists the allowed accounts with the pattern that matched and the agent links", async () => {
    open();
    const row = (await screen.findByRole("cell", { name: "111122223333" })).closest("tr");
    expect(within(row as HTMLElement).getByText("*-payments")).toBeTruthy();
    expect(within(row as HTMLElement).getByText("2")).toBeTruthy();
    expect(screen.queryByRole("cell", { name: "222233334444" })).toBeNull();
  });
  it("team roles read the accounts the API allows, not the whole organization", async () => {
    const { org } = open(teamAdmin());
    await screen.findByRole("cell", { name: "111122223333" });
    expect(org.listAllowed).toHaveBeenCalled();
    expect(org.listOrgAccounts).not.toHaveBeenCalled();
  });
});

describe("AwsAccountAccess narrowing (M4-W2)", () => {
  it("shows the links that will be disabled and saves only after confirming", async () => {
    const { teams } = open();
    await screen.findByRole("cell", { name: "111122223333" });
    const filter = await screen.findByLabelText("Account filter");
    await userEvent.clear(filter);
    await userEvent.type(filter, "prod-payments");
    await userEvent.click(screen.getByRole("button", { name: "Save filter" }));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/444455556666 \(staging-payments\): 1 link disabled/)).toBeTruthy();
    expect(teams.update).not.toHaveBeenCalled();
    await userEvent.click(within(d).getByRole("button", { name: "Save filter" }));
    await waitFor(() =>
      expect(teams.update).toHaveBeenCalledWith(
        { id: "team_1", version: 3 },
        { allowedAwsAccounts: ["prod-payments"] },
      ),
    );
  });
  it("saves a widening change without a confirmation", async () => {
    const { teams } = open();
    await screen.findByRole("cell", { name: "111122223333" });
    const filter = await screen.findByLabelText("Account filter");
    await userEvent.type(filter, ", prod-*");
    await userEvent.click(screen.getByRole("button", { name: "Save filter" }));
    await waitFor(() => expect(teams.update).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("refuses an empty filter on the field without a request", async () => {
    const { teams } = open();
    await screen.findByRole("cell", { name: "111122223333" });
    const filter = await screen.findByLabelText("Account filter");
    await userEvent.clear(filter);
    await userEvent.click(screen.getByRole("button", { name: "Save filter" }));
    expect(await screen.findByText(/at least one pattern/)).toBeTruthy();
    expect(teams.update).not.toHaveBeenCalled();
  });
});

describe("AwsAccountAccess permissions (M4-W3)", () => {
  it("the switch is for service admins; the filter follows teams:set-aws-accounts", async () => {
    open(teamAdmin(["teams:set-aws-accounts"]));
    const sw = await screen.findByRole("switch", { name: "Team manages its own accounts" });
    expect(sw.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(/Requires service admin/)).toBeTruthy();
    expect((screen.getByLabelText("Account filter") as HTMLInputElement).readOnly).toBe(false);
  });
  it("without the permission the filter is read-only and says so", async () => {
    const { teams } = open(teamAdmin());
    const filter = (await screen.findByLabelText("Account filter")) as HTMLInputElement;
    expect(filter.readOnly).toBe(true);
    expect(screen.getAllByText(/Requires service admin/).length).toBeGreaterThan(0);
    const save = screen.getByRole("button", { name: "Save filter" });
    expect(save.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(save);
    expect(teams.update).not.toHaveBeenCalled();
  });
  it("a viewer reads the filter and cannot change anything", async () => {
    open(VIEWER);
    expect(((await screen.findByLabelText("Account filter")) as HTMLInputElement).readOnly).toBe(
      true,
    );
  });
  it("toggling the switch sends mayManageAwsAccounts", async () => {
    const { teams } = open();
    await userEvent.click(
      await screen.findByRole("switch", { name: "Team manages its own accounts" }),
    );
    await waitFor(() =>
      expect(teams.update).toHaveBeenCalledWith(
        { id: "team_1", version: 3 },
        { mayManageAwsAccounts: true },
      ),
    );
  });
  it("shows the API's access denied when a save is forced", async () => {
    const { teams } = open();
    teams.update.mockRejectedValue(
      new AppError({
        kind: "access-denied",
        message: "Requires teams:set-aws-accounts",
        requestId: "r1",
      }),
    );
    await userEvent.click(
      await screen.findByRole("switch", { name: "Team manages its own accounts" }),
    );
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
