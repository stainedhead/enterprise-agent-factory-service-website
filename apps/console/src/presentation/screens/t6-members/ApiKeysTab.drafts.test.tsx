import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DraftStore } from "../../../application/usecases/session/DraftStore.js";
import { draftIds, expectNoDraftLeft, withDrafts } from "../../hooks/useDraft.testing.js";
import { TEAM_ADMIN } from "../../testing/harness.js";
import { fakeApiKeysPort, fakeMembersPort, membersServices } from "../../testing/members.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T6 from "./index.js";

const FORM = "t6-create-api-key:team_1";

function open(drafts: DraftStore, keys = fakeApiKeysPort()) {
  renderScreen(withDrafts(<T6 />, drafts), {
    me: TEAM_ADMIN,
    services: {
      ...teamsServices(fakeTeamsPort({ get: vi.fn(async () => aTeam()) })),
      ...membersServices(fakeMembersPort(), keys),
    },
    path: "/t/team_1/members/api-keys",
    route: "/t/:teamId/members/*",
  });
  return keys;
}
const openDialog = async () => {
  await screen.findByText("ci");
  await userEvent.click(screen.getByRole("button", { name: "Create API key" }));
  return within(screen.getByRole("dialog"));
};

describe("create API key dialog drafts (FR-004, D-6)", () => {
  it("restores the non-secret fields after a remount", async () => {
    const drafts = new DraftStore();
    open(drafts);
    let d = await openDialog();
    await userEvent.type(d.getByLabelText("Name"), "deploy-key");
    expect(draftIds(drafts)).toEqual([FORM]);
    cleanup();
    open(drafts);
    d = await openDialog();
    expect((d.getByLabelText("Name") as HTMLInputElement).value).toBe("deploy-key");
  });

  it("discards the draft on cancel", async () => {
    const drafts = new DraftStore();
    open(drafts);
    const d = await openDialog();
    await userEvent.type(d.getByLabelText("Name"), "x");
    await userEvent.click(d.getByRole("button", { name: "Cancel" }));
    expectNoDraftLeft(drafts);
  });

  it("discards the draft when the key is created, and the key never enters the draft", async () => {
    const drafts = new DraftStore();
    const keys = open(drafts);
    const d = await openDialog();
    await userEvent.type(d.getByLabelText("Name"), "deploy-key");
    await userEvent.click(d.getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(keys.create).toHaveBeenCalled());
    await waitFor(() => expectNoDraftLeft(drafts));
  });
});
