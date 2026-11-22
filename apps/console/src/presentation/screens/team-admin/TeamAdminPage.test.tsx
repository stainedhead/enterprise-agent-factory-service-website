import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { renderApp, SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import S2 from "../s2-teams/index.js";
import { TeamAdminPage } from "./TeamAdminPage.js";

const open = (port = fakeTeamsPort()) =>
  renderScreen(<TeamAdminPage teamId="team_1" />, {
    me: SERVICE_ADMIN,
    services: teamsServices(port),
  });

describe("team detail (M1-T8)", () => {
  it("shows the summary panel", async () => {
    open(
      fakeTeamsPort({
        get: vi.fn(async () => aTeam({ isolationTier: "dedicated", viewerKubectl: true })),
      }),
    );
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Summary" })).toBeTruthy();
    expect(screen.getByText("afs-alpha")).toBeTruthy();
    expect(screen.getByText("Dedicated")).toBeTruthy();
    expect(screen.getAllByText("$1,000.00").length).toBeGreaterThan(0);
    expect(screen.getByText(/Generation 1, observed 1/)).toBeTruthy();
  });

  it("an unknown team is the not-found page, other errors show the request id", async () => {
    const nf = fakeTeamsPort({
      get: vi.fn(async () => {
        throw new AppError({ kind: "not-found", message: "x" });
      }),
    });
    const a = open(nf);
    expect(await screen.findByText(/not found/i)).toBeTruthy();
    a.unmount();
    const bad = fakeTeamsPort({
      get: vi.fn(async () => {
        throw new AppError({ kind: "validation", message: "broken", requestId: "req_t" });
      }),
    });
    open(bad);
    expect(await screen.findByText("broken")).toBeTruthy();
    expect(screen.getByText(/Request id: req_t/)).toBeTruthy();
  });

  it("S2 renders the detail page on the admin route", async () => {
    const port = fakeTeamsPort();
    renderScreen(<S2 />, {
      me: SERVICE_ADMIN,
      services: teamsServices(port),
      path: "/teams/team_1/admin",
      route: "/teams/:teamId/admin",
    });
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeTruthy();
  });
});

describe("S2 access (M1-T4)", () => {
  it.each([
    ["team-admin", TEAM_ADMIN],
    ["viewer", VIEWER],
  ])("a %s opening /teams gets the not-found page", async (_n, me) => {
    renderApp({ me, path: "/teams" });
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
  it("a team-admin opening a team detail page gets the not-found page", async () => {
    renderApp({ me: TEAM_ADMIN, path: "/teams/team_1/admin" });
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});

import S3 from "../s3-create-team/index.js";

describe("S3 access", () => {
  it("a team-admin opening /teams/new gets the not-found page", async () => {
    renderApp({ me: TEAM_ADMIN, path: "/teams/new" });
    expect(await screen.findByText(/not found/i)).toBeTruthy();
    expect(typeof S3).toBe("function");
  });
});
