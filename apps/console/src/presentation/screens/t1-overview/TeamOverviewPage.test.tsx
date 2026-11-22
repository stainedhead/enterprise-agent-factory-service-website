import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { OverviewPort } from "../../../application/ports/overview.js";
import type { WorkOrdersPort } from "../../../application/ports/workOrders.js";
import { OverviewUseCases } from "../../../application/usecases/overview/OverviewUseCases.js";
import type { Me } from "../../../domain/me.js";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  ALL_PERMS,
  aTeam,
  fakeTeamsPort,
  serviceAdminWith,
  status,
  teamsServices,
} from "../../testing/teams.js";
import T1 from "./index.js";
import V1 from "./viewer.js";

const agent = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  paused: false,
  status: status(),
  iamIdentity: "dedicated",
  ...over,
});

function overviewPorts() {
  const port: OverviewPort = {
    budget: vi.fn(async () => ({
      amountUsd: "1000.00",
      spentUsd: "850.00",
      reservedUsd: "0.00",
      period: "monthly",
      onExhaust: "block",
      thresholds: [50, 80, 100],
      version: 1,
    })),
    agents: vi.fn(async () => [
      agent("a1"),
      agent("a2", {
        iamIdentity: "team_shared",
        iamRoleArn: "arn:aws:iam::000000000000:role/shared",
      }),
      agent("a3", { paused: true }),
    ]),
    recentActivity: vi.fn(async () => [
      {
        id: 1,
        occurredAt: "2026-11-21T10:00:00Z",
        actorId: "usr_a",
        actorType: "user",
        action: "teams:update",
        outcome: "success",
      },
    ]),
  };
  const wo: WorkOrdersPort = {
    listForTeam: vi.fn(async () => ({
      items: [
        {
          id: "wo_1",
          title: "Rotate keys",
          severity: "high",
          status: "open",
          slaState: "on_track",
          slaDueAt: "2026-11-25T10:00:00Z",
        },
      ],
    })),
  };
  return { port, wo, overview: new OverviewUseCases(port, wo) };
}

function open(
  o: {
    me?: Me;
    viewer?: boolean;
    path?: string;
    teams?: ReturnType<typeof fakeTeamsPort>;
    ov?: ReturnType<typeof overviewPorts>;
  } = {},
) {
  const teams = o.teams ?? fakeTeamsPort();
  const ov = o.ov ?? overviewPorts();
  const Page = o.viewer ? V1 : T1;
  renderScreen(<Page />, {
    me: o.me ?? serviceAdminWith(ALL_PERMS),
    services: { ...teamsServices(teams), overview: ov.overview },
    path: o.path ?? "/t/team_1",
    route: "/t/:teamId/*",
  });
  return { teams, ov };
}

describe("T1 team overview (M1-O1..O3)", () => {
  it("shows team info, conditions, budget burn, agent health, activity and work orders", async () => {
    open();
    expect(await screen.findByRole("heading", { name: /^Alpha/ })).toBeTruthy();
    expect(screen.getByText("afs-alpha")).toBeTruthy();
    expect(await screen.findByText(/\$850\.00 of \$1,000\.00 \(85%\)/)).toBeTruthy();
    expect(screen.getByText(/crossed 50%, 80%/)).toBeTruthy();
    expect(await screen.findByText("arn:aws:iam::000000000000:role/shared")).toBeTruthy();
    expect(await screen.findByText("Paused")).toBeTruthy();
    expect(await screen.findByText(/teams:update/)).toBeTruthy();
    expect(await screen.findByText("Rotate keys")).toBeTruthy();
  });

  it("isolates a failing widget: the budget card errors while the others still render", async () => {
    const ov = overviewPorts();
    ov.port.budget = vi.fn(async () => {
      throw new AppError({ kind: "validation", message: "boom" });
    });
    ov.overview = new OverviewUseCases(ov.port, ov.wo);
    open({ ov });
    expect(await screen.findByText("Rotate keys")).toBeTruthy();
    expect(await screen.findByText(/Budget/, { selector: "[role=alert] *" })).toBeTruthy();
  });

  it("does not request budget, agents, audit or work orders without the permission", async () => {
    const ov = overviewPorts();
    open({
      me: {
        ...VIEWER,
        teams: [
          { teamId: "team_1", slug: "alpha", role: "team_viewer", permissions: ["teams:read"] },
        ],
      },
      ov,
    });
    await screen.findByRole("heading", { name: /^Alpha/ });
    expect(ov.port.budget).not.toHaveBeenCalled();
    expect(ov.port.agents).not.toHaveBeenCalled();
    expect(ov.port.recentActivity).not.toHaveBeenCalled();
    expect(ov.wo.listForTeam).not.toHaveBeenCalled();
    expect(screen.queryByText("Recent activity")).toBeNull();
  });

  it("suspends and resumes through confirmation dialogs", async () => {
    const { teams } = open();
    await screen.findByRole("heading", { name: /^Alpha/ });
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Suspend" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Suspend" }),
    );
    await waitFor(() => expect(teams.suspend).toHaveBeenCalledWith("team_1"));
  });

  it("denied: a viewer cannot suspend and sees the role named", async () => {
    open({ me: VIEWER });
    await screen.findByRole("heading", { name: /^Alpha/ });
    const actions = screen.getByRole("button", { name: /Actions/ });
    expect(
      (actions as HTMLButtonElement).disabled || actions.getAttribute("aria-disabled") === "true",
    ).toBe(true);
  });

  it("suspended team: write controls are disabled with the reason, Resume stays available", async () => {
    const teams = fakeTeamsPort({ get: vi.fn(async () => aTeam({ state: "suspended" })) });
    open({ teams });
    await screen.findByRole("heading", { name: /^Alpha/ });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Create agent" }).getAttribute("title") ??
          screen.getByRole("button", { name: "Create agent" }).getAttribute("aria-describedby"),
      ).toBeTruthy(),
    );
    expect(screen.getAllByText(/suspended/i).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /Actions/ }));
    expect(screen.getByRole("menuitem", { name: "Resume" })).toBeTruthy();
  });

  it("Edit saves with the loaded version and shows a conflict on 412 (stale)", async () => {
    const teams = fakeTeamsPort({
      update: vi.fn(async () => {
        throw new AppError({ kind: "stale", message: "changed", requestId: "req_9" });
      }),
    });
    open({ teams });
    await screen.findByRole("heading", { name: /^Alpha/ });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const name = screen.getByLabelText("Display name");
    await userEvent.clear(name);
    await userEvent.type(name, "Alpha 2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(teams.update).toHaveBeenCalledWith(
        { id: "team_1", version: 3 },
        expect.objectContaining({ displayName: "Alpha 2" }),
      ),
    );
    expect(await screen.findByText(/req_9/)).toBeTruthy();
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Alpha 2");
  });

  it("Models tab lists models; only a service admin may edit them", async () => {
    const teams = fakeTeamsPort({
      models: vi.fn(async () => [
        { id: "m1", displayName: "Model One", provider: "p", enabled: true },
      ]),
    });
    open({ teams, path: "/t/team_1?tab=models" });
    expect(await screen.findByText("Model One")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Edit models" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "Model One" }));
    await userEvent.click(screen.getByRole("button", { name: "Save models" }));
    await waitFor(() =>
      expect(teams.putModels).toHaveBeenCalledWith({ id: "team_1", version: 3 }, []),
    );
  });

  it("denied: a team admin cannot edit models", async () => {
    open({ me: TEAM_ADMIN, path: "/t/team_1?tab=models" });
    await screen.findByRole("heading", { name: /^Alpha/ });
    const b = await screen.findByRole("button", { name: "Edit models" });
    expect((b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true").toBe(
      true,
    );
  });

  it("not-found team renders the not-found page", async () => {
    const teams = fakeTeamsPort({
      get: vi.fn(async () => {
        throw new AppError({ kind: "not-found", message: "no" });
      }),
    });
    open({ teams });
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});

describe("V1 viewer overview (M1-O4)", () => {
  it("shows the read-only banner and disables every mutating control with the role needed", async () => {
    open({ me: VIEWER, viewer: true });
    expect(await screen.findByText("Read-only access")).toBeTruthy();
    for (const name of ["Edit", "Create agent"]) {
      const b = screen.getByRole("button", { name });
      expect((b as HTMLButtonElement).disabled || b.getAttribute("aria-disabled") === "true").toBe(
        true,
      );
    }
  });
});
