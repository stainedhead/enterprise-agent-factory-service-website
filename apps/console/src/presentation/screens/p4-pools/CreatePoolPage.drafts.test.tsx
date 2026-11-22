import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { DraftStore } from "../../../application/usecases/session/DraftStore.js";
import { draftIds, expectNoDraftLeft, withDrafts } from "../../hooks/useDraft.testing.js";
import { fakeOrgAccountsPort, orgAccountsServices } from "../../testing/adminOrgAccounts.js";
import { TEAM_ADMIN } from "../../testing/harness.js";
import { fakePoolsPort, poolsServices } from "../../testing/pools.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aSecret,
  configServices,
  fakeConfigPort,
  fakeSecretsPort,
  secretsServices,
} from "../../testing/secrets.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import { CreatePoolPage } from "./CreatePoolPage.js";

const FORM = "p4-create-pool:team_1";

function open(drafts: DraftStore, port = fakePoolsPort()) {
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam({ kind: "ephemeral" }));
  teams.models.mockResolvedValue([
    { id: "claude-sonnet", displayName: "Claude Sonnet", provider: "anthropic", enabled: true },
  ]);
  const secrets = fakeSecretsPort();
  secrets.list.mockResolvedValue([aSecret({ id: "sec_1", name: "gh-key" })]);
  renderScreen(withDrafts(<CreatePoolPage />, drafts), {
    me: TEAM_ADMIN,
    services: {
      ...poolsServices(port),
      ...teamsServices(teams),
      ...secretsServices(secrets),
      ...configServices(fakeConfigPort()),
      ...orgAccountsServices(fakeOrgAccountsPort()),
    } as never,
    path: "/t/team_1/pools/new",
    route: "/t/:teamId/pools/new",
  });
  return port;
}
const fill = async () => {
  await userEvent.type(await screen.findByLabelText("Name"), "scanner");
  const w = screen.getByLabelText("Workers");
  await userEvent.clear(w);
  await userEvent.type(w, "8");
  await userEvent.click(screen.getByLabelText("Shared EFS volume"));
};

describe("P4 create pool drafts (FR-004, D-4)", () => {
  it("restores the fields after a remount", async () => {
    const drafts = new DraftStore();
    open(drafts);
    await fill();
    expect(draftIds(drafts)).toEqual([FORM]);
    cleanup();
    open(drafts);
    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe("scanner");
    expect((screen.getByLabelText("Workers") as HTMLInputElement).value).toBe("8");
    expect((screen.getByLabelText("Shared EFS volume") as HTMLInputElement).checked).toBe(true);
  });

  it("discards the draft when the pool is created", async () => {
    const drafts = new DraftStore();
    const port = open(drafts);
    await fill();
    expect(draftIds(drafts)).toEqual([FORM]);
    await userEvent.click(screen.getByRole("button", { name: "Create pool" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    await waitFor(() => expectNoDraftLeft(drafts));
  });

  it("discards the draft on cancel", async () => {
    const drafts = new DraftStore();
    open(drafts);
    await fill();
    expect(draftIds(drafts)).toEqual([FORM]);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectNoDraftLeft(drafts);
  });

  it("keeps the draft when the create is refused", async () => {
    const drafts = new DraftStore();
    const port = open(
      drafts,
      fakePoolsPort({
        create: vi.fn(async () => {
          throw new AppError({ kind: "unavailable", message: "later" });
        }),
      }),
    );
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Create pool" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(draftIds(drafts)).toEqual([FORM]);
  });
});
