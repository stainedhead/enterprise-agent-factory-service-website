import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../../../application/errors.js";
import type { Me } from "../../../../../domain/me.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../../../testing/harness.js";
import { renderScreen } from "../../../../testing/screen.js";
import {
  ALL_PERMS,
  aTeam,
  fakeTeamsPort,
  serviceAdminWith,
  teamsServices,
} from "../../../../testing/teams.js";
import { KubeconfigCard } from "../../../t1-overview/kubeconfig/KubeconfigCard.js";
import { GuardrailsTab } from "./GuardrailsTab.js";

function open(me: Me, team = aTeam(), ui = <GuardrailsTab teamId="team_1" />) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(team);
  renderScreen(ui, {
    me,
    services: teamsServices(teams),
    path: "/t/team_1",
    route: "/t/:teamId",
  });
  return teams;
}

/** The harness team-admin holds every non-admin permission; the real one lacks the service-admin guardrails. */
const REAL_TEAM_ADMIN: Me = {
  ...TEAM_ADMIN,
  teams: TEAM_ADMIN.teams.map((t) => ({
    ...t,
    permissions: t.permissions.filter((p) => p !== "teams:set-guardrails"),
  })),
};

describe("Guardrails (M5-G1, M5-G2)", () => {
  it("a service admin sets the isolation tier after confirming, with the CLI command", async () => {
    const teams = open(serviceAdminWith(ALL_PERMS));
    await screen.findByText("Viewer kubectl is", { exact: false });
    await userEvent.selectOptions(screen.getByLabelText("Isolation tier"), "dedicated");
    await userEvent.click(screen.getByRole("button", { name: "Apply isolation tier" }));
    const d = await screen.findByRole("dialog");
    expect(d.textContent).toContain("afs teams update-team");
    expect(d.textContent).toContain("--isolation-tier dedicated");
    expect(teams.update).not.toHaveBeenCalled();
    await userEvent.click(within(d).getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(teams.update).toHaveBeenCalledWith(
        { id: "team_1", version: 3 },
        { isolationTier: "dedicated" },
      ),
    );
  });
  it("a service admin turns viewer kubectl on after confirming", async () => {
    const teams = open(SERVICE_ADMIN);
    await userEvent.click(await screen.findByRole("button", { name: "Turn on viewer kubectl" }));
    expect((await screen.findByRole("dialog")).textContent).toContain("--viewer-kubectl true");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Apply" }),
    );
    await waitFor(() =>
      expect(teams.update).toHaveBeenCalledWith(
        { id: "team_1", version: 3 },
        { viewerKubectl: true },
      ),
    );
  });
  it.each([
    ["team-admin", REAL_TEAM_ADMIN],
    ["viewer", VIEWER],
  ])(
    "%s sees both controls disabled, Requires service admin, and nothing is sent",
    async (_n, me) => {
      const teams = open(me);
      const b = await screen.findByRole("button", { name: "Turn on viewer kubectl" });
      expect(b.getAttribute("aria-disabled")).toBe("true");
      expect(
        screen.getByRole("button", { name: "Apply isolation tier" }).getAttribute("aria-disabled"),
      ).toBe("true");
      expect((screen.getByLabelText("Isolation tier") as HTMLSelectElement).disabled).toBe(true);
      await userEvent.hover(b);
      expect((await screen.findAllByText("Requires service admin")).length).toBeGreaterThan(0);
      await userEvent.click(b);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(teams.update).not.toHaveBeenCalled();
    },
  );
  it("shows a forced 403 as access denied", async () => {
    const teams = fakeTeamsPort();
    teams.get.mockResolvedValue(aTeam());
    teams.update.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires teams:set-guardrails" }),
    );
    renderScreen(<GuardrailsTab teamId="team_1" />, {
      me: SERVICE_ADMIN,
      services: teamsServices(teams),
      path: "/t/team_1",
      route: "/t/:teamId",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Turn on viewer kubectl" }));
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", { name: "Apply" }),
    );
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
});

describe("KubeconfigCard (M5-G3)", () => {
  const withKubectl = (me: Me): Me => ({
    ...me,
    teams: me.teams.map((t) => ({ ...t, permissions: [...t.permissions, "teams:get-kubeconfig"] })),
  });
  it("with kubectl on, offers the download and the CLI command; the YAML is saved as a file", async () => {
    const create = vi.fn(() => "blob:x");
    const click = vi.fn();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const spy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(click);
    const teams = open(
      withKubectl(VIEWER),
      aTeam({ viewerKubectl: true }),
      <KubeconfigCard teamId="team_1" />,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Download kubeconfig" }));
    await waitFor(() => expect(teams.kubeconfig).toHaveBeenCalledWith("team_1"));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(screen.getByText(/afs teams get-kubeconfig --team-id team_1/)).toBeTruthy();
    spy.mockRestore();
  });
  it("with kubectl off shows neither the button nor the command", async () => {
    open(SERVICE_ADMIN, aTeam({ viewerKubectl: false }), <KubeconfigCard teamId="team_1" />);
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Download kubeconfig" })).toBeNull(),
    );
    expect(screen.queryByText(/get-kubeconfig/)).toBeNull();
  });
  it("without the permission shows nothing even when kubectl is on", async () => {
    open(VIEWER, aTeam({ viewerKubectl: true }), <KubeconfigCard teamId="team_1" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: "Download kubeconfig" })).toBeNull();
  });
});
