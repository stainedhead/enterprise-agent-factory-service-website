import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { TEAM_ADMIN } from "../../testing/harness.js";
import { fakeApiKeysPort, fakeMembersPort, membersServices } from "../../testing/members.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T6 from "./index.js";

describe("FR-002 a denied create API key is visible in the dialog", () => {
  it("names the permission and request id, shows no key, and stays open", async () => {
    const keys = fakeApiKeysPort({
      create: vi.fn(async () =>
        Promise.reject(
          new AppError({
            kind: "access-denied",
            message: "denied",
            requestId: "req_key_403",
            requiredPermission: "api-keys:write",
          }),
        ),
      ),
    });
    renderScreen(<T6 />, {
      me: TEAM_ADMIN,
      services: {
        ...teamsServices(fakeTeamsPort({ get: vi.fn(async () => aTeam()) })),
        ...membersServices(fakeMembersPort(), keys),
      },
      path: "/t/team_1/members/api-keys",
      route: "/t/:teamId/members/*",
    });
    await screen.findByText("ci");
    await userEvent.click(screen.getByRole("button", { name: "Create API key" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Name"), "denied-key");
    await userEvent.click(d.getByRole("button", { name: "Create key" }));
    expect((await d.findByText(/It requires/)).textContent).toContain("api-keys:write");
    expect(d.getByText(/Request id: req_key_403/)).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Done" })).toBeNull();
  });
});
