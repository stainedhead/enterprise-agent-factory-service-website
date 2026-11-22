import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../../../application/errors.js";
import type { Me } from "../../../../../domain/me.js";
import { fakeOrgAccountsPort, orgAccountsServices } from "../../../../testing/adminOrgAccounts.js";
import { anAgent } from "../../../../testing/agents.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../../../testing/harness.js";
import { aLink, fakeIdentityPort, identityServices } from "../../../../testing/identity.js";
import { renderScreen } from "../../../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../../../testing/teams.js";
import { SecretsIdentityTab } from "./SecretsIdentityTab.js";

function open(
  o: {
    me?: Me;
    agent?: ReturnType<typeof anAgent>;
    port?: ReturnType<typeof fakeIdentityPort>;
  } = {},
) {
  const port = o.port ?? fakeIdentityPort();
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam());
  renderScreen(
    <SecretsIdentityTab
      teamId="team_1"
      agent={
        o.agent ??
        anAgent({ iamIdentity: "dedicated", iamRoleArn: "arn:aws:iam::000000000000:role/afs/a" })
      }
    />,
    {
      me: o.me ?? TEAM_ADMIN,
      services: {
        ...identityServices(port),
        ...orgAccountsServices(fakeOrgAccountsPort()),
        ...teamsServices(teams),
      },
      path: "/x",
      route: "/x",
    },
  );
  return port;
}

describe("T8 identity (M4-I1)", () => {
  it("shows the identity, role, Pod Identity association and the accounts the team may use", async () => {
    open();
    expect(await screen.findByText("Dedicated role for this agent")).toBeTruthy();
    expect(screen.getByText("arn:aws:iam::000000000000:role/afs/a")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(
      await screen.findByText(/prod-payments \(111122223333\).*set by service admins/),
    ).toBeTruthy();
  });
  it("lists the links with status and last verified", async () => {
    open();
    const row = (await screen.findByRole("cell", { name: "prod-reader" })).closest(
      "tr",
    ) as HTMLElement;
    expect(within(row).getByText("Verified")).toBeTruthy();
    expect(within(row).getByText("1 hour")).toBeTruthy();
  });
});

describe("T8 add cross-account role (M4-I2)", () => {
  it("is disabled for a shared identity and says why", async () => {
    open({ agent: anAgent({ iamIdentity: "team_shared" }) });
    const b = await screen.findByRole("button", { name: "Add cross-account role" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    await userEvent.hover(b);
    expect(await screen.findByText("Needs a dedicated role")).toBeTruthy();
  });
  it("offers only the allowed accounts and creates the link, then shows the trust policy with Copy", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add cross-account role" }));
    const d = await screen.findByRole("dialog");
    const options = within(within(d).getByLabelText("Account"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["prod-payments · 111122223333", "staging-payments · 444455556666"]);
    await userEvent.type(within(d).getByLabelText("Profile name"), "prod-deployer");
    await userEvent.type(
      within(d).getByLabelText("Role ARN in that account"),
      "arn:aws:iam::111122223333:role/afs/deployer",
    );
    await userEvent.click(within(d).getByRole("button", { name: "Add role" }));
    await waitFor(() => expect(port.createRoleLink).toHaveBeenCalled());
    const t = await screen.findByRole("dialog", { name: "Trust policy for the target role" });
    expect(within(t).getByLabelText("Trust policy").textContent).toContain("sts:ExternalId");
    expect(within(t).getByRole("button", { name: "Copy trust policy" })).toBeTruthy();
  });
  it("refuses a role in another account on the field without a request", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add cross-account role" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Profile name"), "x");
    await userEvent.type(
      within(d).getByLabelText("Role ARN in that account"),
      "arn:aws:iam::444455556666:role/afs/x",
    );
    await userEvent.click(within(d).getByRole("button", { name: "Add role" }));
    expect(await within(d).findByText(/The role must be in account 111122223333/)).toBeTruthy();
    expect(port.createRoleLink).not.toHaveBeenCalled();
  });
});

describe("T8 verification (M4-I3)", () => {
  it("shows Pending trust, then Verified after Verify now", async () => {
    const pending = aLink({ status: "pending_trust", lastVerifiedAt: undefined, version: 1 });
    const done = aLink({ status: "verified", version: 2 });
    let verified = false;
    const port = fakeIdentityPort({ roleLinks: async () => [verified ? done : pending] });
    port.verifyRoleLink.mockImplementation(async () => {
      verified = true;
      return pending;
    });
    open({ port });
    expect(await screen.findByText("Pending trust")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Verify now" }));
    expect(await screen.findByText("Verified")).toBeTruthy();
  });
  it("shows Failed with the reason", async () => {
    open({
      port: fakeIdentityPort({
        roleLinks: async () => [aLink({ status: "failed", lastError: "AccessDenied: no trust" })],
      }),
    });
    expect(await screen.findByText("Failed")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("AccessDenied: no trust");
  });
  it("reads the trust policy of a link on demand", async () => {
    const port = open({
      port: fakeIdentityPort({ roleLinks: async () => [aLink({ trustPolicy: undefined })] }),
    });
    await userEvent.click(
      await screen.findByRole("button", { name: "Trust policy for prod-reader" }),
    );
    expect((await screen.findByLabelText("Trust policy")).textContent).toContain("sts:ExternalId");
    expect(port.roleLink).toHaveBeenCalledWith("team_1", "agt_1", "lnk_1", expect.anything());
  });
  it("removes a link after confirming", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Remove prod-reader" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() =>
      expect(port.deleteRoleLink).toHaveBeenCalledWith("team_1", "agt_1", {
        id: "lnk_1",
        version: 2,
      }),
    );
  });
});

describe("T8 viewers (M4-I4)", () => {
  it("reads the identity, links and trust policies with every change disabled", async () => {
    const port = open({ me: VIEWER });
    expect(await screen.findByText("Dedicated role for this agent")).toBeTruthy();
    await screen.findByRole("button", { name: "Remove prod-reader" });
    for (const n of ["Verify now", "Add cross-account role", "Remove prod-reader"]) {
      const b = screen.getByRole("button", { name: n });
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    await userEvent.click(screen.getByRole("button", { name: "Trust policy for prod-reader" }));
    expect(await screen.findByLabelText("Trust policy")).toBeTruthy();
    expect(port.createRoleLink).not.toHaveBeenCalled();
    expect(port.verifyRoleLink).not.toHaveBeenCalled();
  });
  it("shows the API's access denied when a verification is forced", async () => {
    const port = fakeIdentityPort();
    port.verifyRoleLink.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires identities:write", requestId: "r" }),
    );
    open({ me: SERVICE_ADMIN, port });
    await userEvent.click(await screen.findByRole("button", { name: "Verify now" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});
