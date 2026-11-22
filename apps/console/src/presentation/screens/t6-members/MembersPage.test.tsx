import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { VIEWER as HARNESS_VIEWER, TEAM_ADMIN } from "../../testing/harness.js";
import { aKey, fakeApiKeysPort, fakeMembersPort, membersServices } from "../../testing/members.js";
import { renderScreen } from "../../testing/screen.js";
import {
  ALL_PERMS,
  aTeam,
  fakeTeamsPort,
  serviceAdminWith,
  teamsServices,
} from "../../testing/teams.js";
import T6 from "./index.js";

function open(
  o: {
    me?: Me;
    path?: string;
    members?: ReturnType<typeof fakeMembersPort>;
    keys?: ReturnType<typeof fakeApiKeysPort>;
    providers?: { id: string; name: string; isDefault: boolean }[];
    teams?: ReturnType<typeof fakeTeamsPort>;
  } = {},
) {
  const members = o.members ?? fakeMembersPort();
  const keys = o.keys ?? fakeApiKeysPort();
  const teams =
    o.teams ?? fakeTeamsPort({ get: vi.fn(async () => aTeam({ identityProviderId: "idp_1" })) });
  renderScreen(<T6 />, {
    me: o.me ?? TEAM_ADMIN,
    services: {
      ...teamsServices(teams, {
        providers: o.providers ?? [
          { id: "idp_1", name: "Corporate SSO", isDefault: true },
          { id: "idp_2", name: "Contractors", isDefault: false },
        ],
      }),
      ...membersServices(members, keys),
    },
    path: o.path ?? "/t/team_1/members",
    route: "/t/:teamId/members/*",
  });
  return { members, keys, teams };
}

// a real viewer holds no api-keys permission (the harness viewer holds every read)
const VIEWER: Me = {
  ...HARNESS_VIEWER,
  teams: [
    {
      ...(HARNESS_VIEWER.teams[0] as Me["teams"][number]),
      permissions: HARNESS_VIEWER.teams[0]?.permissions.filter((p) => p !== "api-keys:read") ?? [],
    },
  ],
};

const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("T6 members (M1-M1)", () => {
  it("lists people and groups with their roles", async () => {
    open();
    expect(await screen.findByText("ana@example.com")).toBeTruthy();
    expect(screen.getByText("payments-eng")).toBeTruthy();
    expect(screen.getByText("IdP group")).toBeTruthy();
    expect(screen.getByText("Team admin")).toBeTruthy();
  });

  it("adds a person by email as team viewer and shows the CLI command", async () => {
    const { members } = open();
    await screen.findByText("ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email"), "bo@example.com");
    expect(within(dialog).getByText(/afs members add-member/)).toBeTruthy();
    const roleOptions = within(within(dialog).getByLabelText("Role"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(roleOptions).toEqual(["Team admin", "Team collaborator", "Team viewer"]);
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(members.add).toHaveBeenCalledWith("team_1", {
        subjectType: "user",
        role: "team_viewer",
        email: "bo@example.com",
      }),
    );
  });

  it("adds an IdP group", async () => {
    const { members } = open();
    await screen.findByText("ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.selectOptions(within(dialog).getByLabelText("Add"), "group");
    await userEvent.type(within(dialog).getByLabelText("Group name"), "ops");
    await userEvent.selectOptions(within(dialog).getByLabelText("Role"), "team_admin");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(members.add).toHaveBeenCalledWith("team_1", {
        subjectType: "group",
        role: "team_admin",
        groupName: "ops",
      }),
    );
  });

  it("shows the API's refusal of a crafted role and keeps the dialog open", async () => {
    const members = fakeMembersPort({
      add: vi.fn(async () => {
        throw new AppError({
          kind: "validation",
          message: "service_admin cannot be a team role",
          requestId: "req_7",
        });
      }),
    });
    open({ members });
    await screen.findByText("ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Email"), "bo@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText(/service_admin cannot be a team role/)).toBeTruthy();
    expect(within(dialog).getByText(/req_7/)).toBeTruthy();
  });

  it("shows field errors from the use case without calling the API", async () => {
    const { members } = open();
    await screen.findByText("ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add member" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Add" }));
    expect((await screen.findAllByText("Enter an email address")).length).toBeGreaterThan(0);
    expect(members.add).not.toHaveBeenCalled();
  });

  it("changes a role against the held version and removes after confirming", async () => {
    const { members } = open();
    await screen.findByText("ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Change role of ana@example.com" }));
    await userEvent.selectOptions(
      within(screen.getByRole("dialog")).getByLabelText("Role"),
      "team_admin",
    );
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(members.update).toHaveBeenCalledWith(
        "team_1",
        { id: "mem_1", version: 2 },
        "team_admin",
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove ana@example.com" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }),
    );
    await waitFor(() =>
      expect(members.remove).toHaveBeenCalledWith("team_1", { id: "mem_1", version: 2 }),
    );
  });

  it("a 412 on a role change offers a reload", async () => {
    const members = fakeMembersPort({
      update: vi.fn(async () => {
        throw new AppError({ kind: "stale", message: "changed", requestId: "req_8" });
      }),
    });
    open({ members });
    await screen.findByText("ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Change role of ana@example.com" }));
    await userEvent.selectOptions(
      within(screen.getByRole("dialog")).getByLabelText("Role"),
      "team_admin",
    );
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: /Reload/ })).toBeTruthy();
  });
});

describe("T6 viewer (M1-M3)", () => {
  it("disables every membership control with the role named and shows no API keys tab", async () => {
    open({ me: VIEWER });
    await screen.findByText("ana@example.com");
    for (const name of ["Add member", "Change role of ana@example.com", "Remove ana@example.com"]) {
      expect(disabled(screen.getByRole("button", { name }))).toBe(true);
    }
    expect(screen.queryByRole("tab", { name: "API keys" })).toBeNull();
    // the denied reason names the role
    await userEvent.hover(screen.getByRole("button", { name: "Add member" }));
    expect((await screen.findByRole("tooltip")).textContent).toBe("Requires team-admin");
  });

  it("falls back to Members when a viewer opens the API keys path", async () => {
    const { keys } = open({ me: VIEWER, path: "/t/team_1/members/api-keys" });
    expect(await screen.findByRole("tab", { name: "Members", selected: true })).toBeTruthy();
    expect(keys.list).not.toHaveBeenCalled();
  });
});

describe("T6 sign-in provider (M1-M4)", () => {
  it("shows the provider and lets a team admin change it", async () => {
    const { teams } = open();
    expect(await screen.findByText("Corporate SSO", { selector: "strong" })).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText("Change sign-in provider"), "idp_2");
    await userEvent.click(screen.getByRole("button", { name: "Save provider" }));
    await waitFor(() =>
      expect(teams.update).toHaveBeenCalledWith(
        { id: "team_1", version: 3 },
        { identityProviderId: "idp_2" },
      ),
    );
  });

  it("denied: a viewer cannot save a provider change", async () => {
    open({ me: VIEWER });
    await screen.findByText("Corporate SSO", { selector: "strong" });
    await userEvent.selectOptions(screen.getByLabelText("Change sign-in provider"), "idp_2");
    expect(disabled(screen.getByRole("button", { name: "Save provider" }))).toBe(true);
  });
});

describe("T6 API keys (M1-M2, M1-M5)", () => {
  const keysTab = () => open({ path: "/t/team_1/members/api-keys" });

  it("lists prefix, role, expiry and last use", async () => {
    keysTab();
    const row = (await screen.findByText("ci")).closest("tr") as HTMLElement;
    expect(within(row).getByText("afs_ab12")).toBeTruthy();
    expect(within(row).getByText("Team viewer")).toBeTruthy();
    expect(within(row).getByText("Never")).toBeTruthy();
  });

  it("creates a key with a 30 day default, shows the secret once and clears it on close", async () => {
    const { keys } = keysTab();
    await screen.findByText("ci");
    await userEvent.click(screen.getByRole("button", { name: "Create API key" }));
    const dialog = screen.getByRole("dialog");
    expect((within(dialog).getByLabelText(/Expires in/) as HTMLInputElement).value).toBe("30");
    await userEvent.type(within(dialog).getByLabelText("Name"), "new");
    expect(within(dialog).getByText(/afs api-keys create-api-key/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() =>
      expect(keys.create).toHaveBeenCalledWith("team_1", {
        name: "new",
        role: "team_viewer",
        expiresAt: "2026-12-22T00:00:00.000Z",
      }),
    );
    expect(await screen.findByText("afs_SENTINEL")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText("afs_SENTINEL")).toBeNull();
    expect(document.body.textContent).not.toContain("afs_SENTINEL");
  });

  it("refuses more than 90 days on the field", async () => {
    const { keys } = keysTab();
    await screen.findByText("ci");
    await userEvent.click(screen.getByRole("button", { name: "Create API key" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Name"), "x");
    const days = within(dialog).getByLabelText(/Expires in/);
    await userEvent.clear(days);
    await userEvent.type(days, "120");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    expect(await within(dialog).findByText(/from 1 to 90/)).toBeTruthy();
    expect(keys.create).not.toHaveBeenCalled();
  });

  it("a replayed create says the key cannot be shown again and offers Delete key", async () => {
    const keys = fakeApiKeysPort({
      create: vi.fn(async () => ({
        key: aKey({ id: "key_9", name: "replayed" }),
        secretKey: undefined,
        replayed: true,
      })),
    });
    open({ keys, path: "/t/team_1/members/api-keys" });
    await screen.findByText("ci");
    await userEvent.click(screen.getByRole("button", { name: "Create API key" }));
    await userEvent.type(within(screen.getByRole("dialog")).getByLabelText("Name"), "replayed");
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Create key" }),
    );
    expect(await screen.findByText(/cannot be shown again/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Delete key" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(keys.delete).toHaveBeenCalledWith("team_1", "key_9"));
  });

  it("deletes a key after confirming", async () => {
    const { keys } = keysTab();
    await screen.findByText("ci");
    await userEvent.click(screen.getByRole("button", { name: "Delete key ci" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() => expect(keys.delete).toHaveBeenCalledWith("team_1", "key_1"));
  });

  it("denied: a service admin without api-keys:write... a team viewer-like admin cannot create", async () => {
    const me: Me = {
      ...TEAM_ADMIN,
      teams: [
        {
          ...(TEAM_ADMIN.teams[0] as Me["teams"][number]),
          permissions: ["members:read", "api-keys:read", "teams:read"],
        },
      ],
    };
    open({ me, path: "/t/team_1/members/api-keys" });
    await screen.findByText("ci");
    expect(disabled(screen.getByRole("button", { name: "Create API key" }))).toBe(true);
    expect(disabled(screen.getByRole("button", { name: "Delete key ci" }))).toBe(true);
  });

  it("a suspended team disables key creation", async () => {
    const teams = fakeTeamsPort({ get: vi.fn(async () => aTeam({ state: "suspended" })) });
    open({ teams, me: serviceAdminWith(ALL_PERMS), path: "/t/team_1/members/api-keys" });
    await screen.findByText("ci");
    await waitFor(() =>
      expect(disabled(screen.getByRole("button", { name: "Create API key" }))).toBe(true),
    );
  });
});

describe("T6 collaborator role (WEB-US-56)", () => {
  it("the member role picker offers Team collaborator beside admin and viewer", async () => {
    const { members } = open();
    await screen.findByText("ana@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Change role of ana@example.com" }));
    const picker = within(screen.getByRole("dialog")).getByLabelText("Role");
    expect(
      within(picker)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Team admin", "Team collaborator", "Team viewer"]);
    await userEvent.selectOptions(picker, "team_collaborator");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(members.update).toHaveBeenCalledWith(
        "team_1",
        { id: "mem_1", version: 2 },
        "team_collaborator",
      ),
    );
  });
  it("the API key role picker offers Team collaborator", async () => {
    open({ path: "/t/team_1/members/api-keys" });
    await screen.findByText("ci");
    await userEvent.click(screen.getByRole("button", { name: "Create API key" }));
    const picker = within(screen.getByRole("dialog")).getByLabelText("Role");
    expect(within(picker).getByRole("option", { name: "Team collaborator" })).toBeTruthy();
  });
});
