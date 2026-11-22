import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { fakeOrgAccountsPort, orgAccountsServices } from "../../testing/adminOrgAccounts.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { aPool, aRoleLink, fakePoolsPort, poolsServices } from "../../testing/pools.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aSecret,
  configServices,
  fakeConfigPort,
  fakeSecretsPort,
  secretsServices,
} from "../../testing/secrets.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import P4 from "./index.js";

function open(
  o: { me?: Me; port?: ReturnType<typeof fakePoolsPort>; kind?: string; path?: string } = {},
) {
  const port = o.port ?? fakePoolsPort();
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam({ kind: o.kind ?? "ephemeral" }));
  teams.models.mockResolvedValue([
    { id: "claude-sonnet", displayName: "Claude Sonnet", provider: "anthropic", enabled: true },
  ]);
  const secrets = fakeSecretsPort();
  secrets.list.mockResolvedValue([aSecret({ id: "sec_1", name: "gh-key" })]);
  renderScreen(<P4 />, {
    me: o.me ?? TEAM_ADMIN,
    services: {
      ...poolsServices(port),
      ...teamsServices(teams),
      ...secretsServices(secrets),
      ...configServices(fakeConfigPort()),
      ...orgAccountsServices(fakeOrgAccountsPort()),
    } as never,
    path: o.path ?? "/t/team_1/pools",
    route: "/t/:teamId/pools/*",
  });
  return port;
}

describe("P4 pools (M5-P2)", () => {
  it("shows stages in order with their pools, worker counts, handoffs, storage and the template-retired flag", async () => {
    open({
      port: fakePoolsPort({
        list: async () => [
          aPool(),
          aPool({
            id: "pool_2",
            name: "fixers",
            stageId: "stg_2",
            template: "old",
            sharedVolume: "efs",
            handoffs: [],
            version: 1,
          }),
        ],
      }),
    });
    expect(await screen.findByRole("region", { name: "Stage 1 · triage" })).toBeTruthy();
    const s2 = screen.getByRole("region", { name: "Stage 2 · fix" });
    expect(within(s2).getByText("fixers")).toBeTruthy();
    expect(within(s2).getByText("Template retired")).toBeTruthy();
    expect(within(s2).getByText("Scratch 20 GiB + shared EFS")).toBeTruthy();
    const s1 = screen.getByRole("region", { name: "Stage 1 · triage" });
    expect(
      await within(s1).findByText(/4 reporting · 2 working · 1 idle · 1 impaired/),
    ).toBeTruthy();
    expect(within(s1).getByText("fixers", { exact: true })).toBeTruthy(); // handoff target
  });

  it("scales within 0 to 200 and shows the CLI command", async () => {
    const port = open();
    await userEvent.click(await screen.findByLabelText("Select pool_1"));
    await userEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Scale" }));
    const d = await screen.findByRole("dialog");
    const input = within(d).getByLabelText("Workers");
    await userEvent.clear(input);
    await userEvent.type(input, "250");
    await userEvent.click(within(d).getByRole("button", { name: "Scale" }));
    expect((await within(d).findAllByRole("alert")).map((a) => a.textContent).join(" ")).toMatch(
      /from 0 to 200/,
    );
    expect(port.scale).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, "20");
    expect(d.textContent).toContain("afs pools scale-pool");
    expect(d.textContent).toContain("--workers 20");
    await userEvent.click(within(d).getByRole("button", { name: "Scale" }));
    await waitFor(() => expect(port.scale).toHaveBeenCalledWith("team_1", "pool_1", 20));
  });

  it("pauses, resumes and deletes with confirmation", async () => {
    const port = open();
    await userEvent.click(await screen.findByLabelText("Select pool_1"));
    await userEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Pause" }));
    await waitFor(() => expect(port.pause).toHaveBeenCalledWith("team_1", "pool_1"));
    await userEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(port.delete).toHaveBeenCalledWith("team_1", { id: "pool_1", version: 3 }),
    );
  });

  it("adds a stage and refuses a position outside 1 to 50 before calling", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add stage" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Stage name"), "verify");
    await userEvent.type(within(d).getByLabelText("Position"), "51");
    await userEvent.click(within(d).getByRole("button", { name: "Add stage" }));
    expect(await within(d).findByText(/from 1 to 50/)).toBeTruthy();
    expect(port.createStage).not.toHaveBeenCalled();
    await userEvent.clear(within(d).getByLabelText("Position"));
    await userEvent.type(within(d).getByLabelText("Position"), "3");
    await userEvent.click(within(d).getByRole("button", { name: "Add stage" }));
    await waitFor(() =>
      expect(port.createStage).toHaveBeenCalledWith("team_1", { name: "verify", position: 3 }),
    );
  });

  it("links a shared named role in the allowed accounts and skips none that are linked", async () => {
    const port = open({ port: fakePoolsPort({ roleLinks: async () => [] }) });
    await userEvent.click(await screen.findByLabelText("Select pool_1"));
    await userEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Link shared role" }));
    const d = await screen.findByRole("dialog");
    await userEvent.type(within(d).getByLabelText("Role name"), "swarm-reader");
    await userEvent.click(await within(d).findByLabelText(/prod-payments/));
    await userEvent.click(within(d).getByLabelText(/staging-payments/));
    expect(within(d).queryByLabelText(/prod-platform/)).toBeNull(); // outside the team's filter
    await userEvent.click(within(d).getByRole("button", { name: "Link role" }));
    await waitFor(() => expect(port.createRoleLink).toHaveBeenCalledTimes(2));
    expect(port.createRoleLink.mock.calls[0]?.[2]).toMatchObject({
      accountId: "111122223333",
      roleName: "swarm-reader",
    });
  });

  it("shows an existing shared role with its accounts", async () => {
    open({ port: fakePoolsPort({ roleLinks: async () => [aRoleLink()] }) });
    expect((await screen.findAllByText("swarm-reader · 1 account ✓")).length).toBeGreaterThan(0);
  });

  it("a viewer sees every control disabled with the role it needs and nothing is sent", async () => {
    const port = open({ me: VIEWER });
    await screen.findByRole("region", { name: "Stage 1 · triage" });
    for (const n of [
      "Add stage",
      "Create pool",
      /^Actions/,
      "Move stage triage",
      "Delete stage triage",
    ]) {
      const b = screen.getByRole("button", { name: n });
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    await userEvent.hover(screen.getByRole("button", { name: "Add stage" }));
    expect(await screen.findByText("Requires team-admin")).toBeTruthy();
    expect(port.createStage).not.toHaveBeenCalled();
    expect(port.scale).not.toHaveBeenCalled();
  });

  it("shows the API's access denied for a forced scale", async () => {
    open({
      port: fakePoolsPort({
        scale: async () => {
          throw new AppError({ kind: "access-denied", message: "Requires pools:write" });
        },
      }),
    });
    await userEvent.click(await screen.findByLabelText("Select pool_1"));
    await userEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Scale" }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Scale" }));
    expect(await within(d).findByText("You do not have access")).toBeTruthy();
  });

  it("is not found for a persistent team", async () => {
    open({ kind: "persistent" });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });

  it("lists no pools helpfully", async () => {
    open({
      port: fakePoolsPort({ list: async () => [], listStages: async () => [] }),
      me: SERVICE_ADMIN,
    });
    expect(await screen.findByText(/No pools or stages yet/)).toBeTruthy();
  });
});

describe("P4 create pool (M5-P3, M5-P4)", () => {
  async function fill() {
    await userEvent.type(await screen.findByLabelText("Name"), "scanner");
  }
  it("creates a pool with workers, stage and scratch space; shows the CLI command", async () => {
    const port = open({ path: "/t/team_1/pools/new" });
    await fill();
    await userEvent.selectOptions(screen.getByLabelText("Stage"), "stg_1");
    const w = screen.getByLabelText("Workers");
    await userEvent.clear(w);
    await userEvent.type(w, "8");
    await userEvent.click(screen.getByLabelText("Shared EFS volume"));
    await waitFor(() =>
      expect(screen.getByRole("complementary", { name: "Equivalent CLI" }).textContent).toContain(
        "afs pools create-pool",
      ),
    );
    expect(screen.getByRole("complementary", { name: "Equivalent CLI" }).textContent).toContain(
      "--workers 8",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create pool" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(port.create.mock.calls[0]?.[1]).toMatchObject({
      name: "scanner",
      workers: 8,
      stageId: "stg_1",
      sharedVolume: "efs",
      scratchSizeGiB: 20,
    });
  });
  it("refuses a name an agent or pool already uses, and workers above 200", async () => {
    const port = open({ path: "/t/team_1/pools/new" });
    await userEvent.type(await screen.findByLabelText("Name"), "reviewer-bot");
    expect(await screen.findByText(/already has this name/)).toBeTruthy();
    const w = screen.getByLabelText("Workers");
    await userEvent.clear(w);
    await userEvent.type(w, "201");
    await userEvent.click(screen.getByRole("button", { name: "Create pool" }));
    expect(await screen.findByText(/from 0 to 200/)).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
  });
  it("offers only enabled templates", async () => {
    open({ path: "/t/team_1/pools/new" });
    const t = (await screen.findByLabelText("Template")) as HTMLSelectElement;
    expect([...t.options].map((o) => o.value)).not.toContain("old");
  });
  it("disables Create pool for a viewer", async () => {
    open({ path: "/t/team_1/pools/new", me: VIEWER });
    const b = await screen.findByRole("button", { name: "Create pool" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
  });
});
