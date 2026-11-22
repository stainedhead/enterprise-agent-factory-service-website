import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeOrgAccountsPort, orgAccountsServices } from "../../testing/adminOrgAccounts.js";
import { agentsServices, anAgent, fakeAgentsPort } from "../../testing/agents.js";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { fakeIdentityPort, identityServices } from "../../testing/identity.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T8 from "./index.js";

function open(me = TEAM_ADMIN) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam({ allowedAwsAccounts: ["*-payments"] }));
  const agents = fakeAgentsPort();
  agents.list.mockResolvedValue([
    anAgent({ id: "agt_1", name: "reviewer", iamIdentity: "team_shared" }),
    anAgent({
      id: "agt_2",
      name: "triage",
      iamIdentity: "dedicated",
      iamRoleArn: "arn:aws:iam::0:role/t",
    }),
  ] as never);
  renderScreen(<T8 />, {
    me,
    services: {
      ...agentsServices(agents),
      ...identityServices(fakeIdentityPort()),
      ...orgAccountsServices(fakeOrgAccountsPort()),
      ...teamsServices(teams),
    },
    path: "/t/team_1/identities",
    route: "/t/:teamId/identities",
  });
}

describe("T8 team view (M4-I6)", () => {
  it("lists every agent's identity and links, each opening the agent's tab", async () => {
    open();
    const row = (await screen.findByRole("cell", { name: "triage" })).closest("tr") as HTMLElement;
    expect(within(row).getByText("Dedicated role")).toBeTruthy();
    expect(await within(row).findByText(/prod-reader · 111122223333/)).toBeTruthy();
    const link = within(row).getByRole("link", { name: "Open triage" });
    expect(link.getAttribute("href")).toBe("/t/team_1/agents/agt_2?tab=secrets-identity");
  });
  it("shows the AWS account access section, read-only for a viewer", async () => {
    open(VIEWER);
    expect(await screen.findByText("AWS account access")).toBeTruthy();
    expect(((await screen.findByLabelText("Account filter")) as HTMLInputElement).readOnly).toBe(
      true,
    );
  });
  it("is not found without identities:read", async () => {
    open({ ...VIEWER, teams: [] } as never);
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
