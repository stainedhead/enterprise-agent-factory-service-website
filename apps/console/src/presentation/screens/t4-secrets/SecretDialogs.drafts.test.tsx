import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DraftStore } from "../../../application/usecases/session/DraftStore.js";
import { draftIds, expectNoDraftLeft, withDrafts } from "../../hooks/useDraft.testing.js";
import { agentsServices, fakeAgentsPort } from "../../testing/agents.js";
import { externalSystemsServices, fakeExternalSystemsPort } from "../../testing/externalSystems.js";
import { TEAM_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { fakeSecretsPort, secretsServices } from "../../testing/secrets.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T4 from "./index.js";

const FORM = "t4-create-secret:team_1";
const SENTINEL = "s3ntinel-never-drafted-4";

function open(drafts: DraftStore, secrets = fakeSecretsPort()) {
  renderScreen(withDrafts(<T4 />, drafts), {
    me: TEAM_ADMIN,
    services: {
      ...teamsServices(fakeTeamsPort({ get: vi.fn(async () => aTeam()) })),
      ...agentsServices(fakeAgentsPort()),
      ...secretsServices(secrets),
      ...externalSystemsServices(fakeExternalSystemsPort()),
    },
    path: "/t/team_1/secrets",
    route: "/t/:teamId/secrets",
  });
  return secrets;
}
const openDialog = async () => {
  await screen.findByText("github-bot-key");
  await userEvent.click(screen.getByRole("button", { name: "Create secret" }));
  return within(screen.getByRole("dialog"));
};

describe("create secret dialog drafts (FR-004, D-6)", () => {
  it("restores the non-secret fields after a remount and never drafts the value", async () => {
    const drafts = new DraftStore();
    open(drafts);
    let d = await openDialog();
    await userEvent.type(d.getByLabelText("Name"), "pagerduty-token");
    await userEvent.type(d.getByLabelText("Description"), "pager");
    await userEvent.type(d.getByLabelText("Secret value"), SENTINEL);
    expect(draftIds(drafts)).toEqual([FORM]);
    expect(JSON.stringify(drafts.snapshot())).not.toContain(SENTINEL);
    cleanup();
    open(drafts);
    d = await openDialog();
    expect((d.getByLabelText("Name") as HTMLInputElement).value).toBe("pagerduty-token");
    expect((d.getByLabelText("Description") as HTMLInputElement).value).toBe("pager");
    expect((d.getByLabelText("Secret value") as HTMLInputElement).value).toBe("");
  });

  it("discards the draft on cancel", async () => {
    const drafts = new DraftStore();
    open(drafts);
    const d = await openDialog();
    await userEvent.type(d.getByLabelText("Name"), "x");
    expect(draftIds(drafts)).toEqual([FORM]);
    await userEvent.click(d.getByRole("button", { name: "Cancel" }));
    expectNoDraftLeft(drafts);
  });

  it("discards the draft when the secret is created", async () => {
    const drafts = new DraftStore();
    const secrets = open(drafts);
    const d = await openDialog();
    await userEvent.type(d.getByLabelText("Name"), "pagerduty-token");
    await userEvent.type(d.getByLabelText("Secret value"), SENTINEL);
    await userEvent.click(d.getByRole("button", { name: "Create secret" }));
    await waitFor(() => expect(secrets.create).toHaveBeenCalled());
    await waitFor(() => expectNoDraftLeft(drafts));
  });
});
