import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppError } from "../../../application/errors.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { aTagsView, fakeServiceTagsPort, fakeTagsPort, tagsServices } from "../../testing/tags.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T13 from "./index.js";

function open(me = TEAM_ADMIN, port = fakeTagsPort()) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam());
  renderScreen(<T13 />, {
    me,
    services: { ...tagsServices(fakeServiceTagsPort(), port), ...teamsServices(teams) },
    path: "/t/team_1/tags",
    route: "/t/:teamId/tags",
  });
  return port;
}

describe("T13 tags (M4-G4)", () => {
  it("lists system, service, required and team tags with their source", async () => {
    open();
    expect(await screen.findByText("afs-team-id")).toBeTruthy();
    expect(screen.getByText("System")).toBeTruthy();
    expect(screen.getByText("Service (fixed)")).toBeTruthy();
    expect(screen.getByText("Required, not set")).toBeTruthy();
    expect(screen.getAllByText("Team").length).toBeGreaterThan(0);
  });
  it("system and fixed tags have no inputs; required and team tags do", async () => {
    open();
    await screen.findByText("afs-team-id");
    expect(screen.queryByLabelText("Value of afs-team-id")).toBeNull();
    expect(screen.queryByLabelText("Value of region")).toBeNull();
    expect(screen.getByLabelText("Value of environment")).toBeTruthy();
    expect(screen.getByLabelText("Value of cost-center")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Remove region" })).toBeNull();
  });
  it("saves the required value and own tags with the version read, never system or fixed", async () => {
    const port = open();
    await userEvent.type(await screen.findByLabelText("Value of environment"), "prod");
    await userEvent.click(screen.getByRole("button", { name: "Save tags" }));
    await waitFor(() => expect(port.put).toHaveBeenCalled());
    expect(port.put).toHaveBeenCalledWith("team_1", 5, [
      { key: "environment", value: "prod" },
      { key: "cost-center", value: "CC-1" },
    ]);
  });
  it("adds a tag and refuses a reserved key without a request", async () => {
    const port = open();
    await userEvent.click(await screen.findByRole("button", { name: "Add tag" }));
    await userEvent.type(screen.getByLabelText("New tag key"), "afs-x");
    await userEvent.type(screen.getByLabelText("Value of afs-x"), "1");
    expect(await screen.findByText(/reserved/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Save tags" }).getAttribute("aria-disabled") ?? "",
    ).not.toBe("");
    expect(port.put).not.toHaveBeenCalled();
  });
});

describe("T13 dropped keys (M4-G5)", () => {
  it("lists the keys left out of Bedrock request metadata", async () => {
    open(
      TEAM_ADMIN,
      fakeTagsPort({ get: async () => aTagsView({ droppedKeys: ["zeta", "omega"] }) }),
    );
    expect(await screen.findByText(/zeta, omega/)).toBeTruthy();
  });
  it("shows nothing when none are dropped", async () => {
    open();
    await screen.findByText("afs-team-id");
    expect(screen.queryByText(/Bedrock accepts 16/)).toBeNull();
  });
});

describe("T13 permissions (M4-G4)", () => {
  it("a viewer reads every tag with Add and Save disabled naming the role", async () => {
    open(VIEWER);
    expect(await screen.findByText("afs-team-id")).toBeTruthy();
    expect(screen.queryByLabelText("Value of environment")).toBeNull();
    for (const n of ["Add tag", "Save tags"]) {
      const b = screen.getByRole("button", { name: n });
      expect(b.getAttribute("aria-disabled")).toBe("true");
    }
    await userEvent.hover(screen.getByRole("button", { name: "Add tag" }));
    expect(await screen.findByText("Requires team-admin")).toBeTruthy();
  });
  it("shows the API's access denied when a save is forced", async () => {
    const port = fakeTagsPort();
    port.put.mockRejectedValue(
      new AppError({ kind: "access-denied", message: "Requires tags:write", requestId: "r" }),
    );
    open(SERVICE_ADMIN, port);
    await userEvent.type(await screen.findByLabelText("Value of environment"), "prod");
    await userEvent.click(screen.getByRole("button", { name: "Save tags" }));
    expect(await screen.findByText("You do not have access")).toBeTruthy();
  });
  it("shows the conflict when the tags changed since they were read", async () => {
    const port = fakeTagsPort();
    port.put.mockRejectedValue(new AppError({ kind: "stale", message: "changed", requestId: "r" }));
    open(TEAM_ADMIN, port);
    await userEvent.type(await screen.findByLabelText("Value of environment"), "prod");
    await userEvent.click(screen.getByRole("button", { name: "Save tags" }));
    expect(await screen.findByText("This changed since you opened it")).toBeTruthy();
    expect((screen.getByLabelText("Value of environment") as HTMLInputElement).value).toBe("prod");
  });
  it("is not found without tags:read", async () => {
    open({ ...VIEWER, teams: [] } as never);
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
