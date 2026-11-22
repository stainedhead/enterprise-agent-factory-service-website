import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { DraftStore } from "../../../application/usecases/session/DraftStore.js";
import { draftIds, expectNoDraftLeft, withDrafts } from "../../hooks/useDraft.testing.js";
import { SERVICE_ADMIN } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  ALL_PERMS,
  aTeam,
  fakeTeamsPort,
  serviceAdminWith,
  teamsServices,
} from "../../testing/teams.js";
import { CreateTeamPage } from "./CreateTeamPage.js";

const tag = { key: "environment", mode: "required", allowedValues: ["prod", "dev"] };
const IDPS = [
  { id: "idp_1", name: "Corporate SSO", isDefault: true },
  { id: "idp_2", name: "Partners", isDefault: false },
];

function open(over = {}, me = SERVICE_ADMIN, providers: typeof IDPS = [], drafts?: DraftStore) {
  const port = fakeTeamsPort({ serviceTags: vi.fn(async () => [tag]), ...over });
  const view = renderScreen(drafts ? withDrafts(<CreateTeamPage />, drafts) : <CreateTeamPage />, {
    me,
    services: teamsServices(port, { providers }),
    path: "/teams/new",
    route: "/teams/new",
  });
  return { port, ...view };
}
const next = () => screen.getByRole("button", { name: /^(Next|Review)$/ });

async function fillDetails() {
  await userEvent.type(screen.getByLabelText("Display name"), "Payments");
  await userEvent.type(screen.getByLabelText("Slug"), "payments");
  await userEvent.selectOptions(await screen.findByLabelText("Tag: environment"), "prod");
}
async function fillAll() {
  await fillDetails();
  await userEvent.click(next());
  await userEvent.click(await screen.findByLabelText(/Model One/));
  await userEvent.click(next());
  await userEvent.type(screen.getByLabelText("Monthly budget (USD)"), "5000.00");
  await userEvent.click(next());
  await userEvent.type(screen.getByLabelText("Admin email"), "lead@example.com");
  await userEvent.click(next());
}

describe("S3 create team wizard (M1-T5)", () => {
  it("Next is disabled until each step is valid", async () => {
    open();
    expect(next().getAttribute("aria-disabled")).toBe("true");
    await fillDetails();
    expect(next().getAttribute("aria-disabled")).toBeNull();
    await userEvent.click(next());
    expect(next().getAttribute("aria-disabled")).toBe("true"); // no model chosen yet
    await userEvent.click(await screen.findByLabelText(/Model One/));
    expect(next().getAttribute("aria-disabled")).toBeNull();
    await userEvent.click(next());
    expect(next().getAttribute("aria-disabled")).toBe("true"); // no budget yet
    await userEvent.type(screen.getByLabelText("Monthly budget (USD)"), "ten");
    expect(await screen.findByText("Enter an amount such as 5000.00")).toBeTruthy();
  });

  it("the review step shows everything and the equivalent CLI command, then creates", async () => {
    const { port } = open();
    await fillAll();
    expect(screen.getByText("Payments")).toBeTruthy();
    expect(screen.getByText("$5,000.00")).toBeTruthy();
    expect(screen.getByText("lead@example.com")).toBeTruthy();
    const cmd = document.querySelector("code")?.textContent ?? "";
    expect(cmd).toContain("afs teams create-team");
    expect(cmd).toContain("--display-name Payments");
    expect(cmd).toContain("--max-budget-usd 5000.00");
    await userEvent.click(screen.getByRole("button", { name: "Create team" }));
    await waitFor(() => expect(port.create).toHaveBeenCalledTimes(1));
    const sent = port.create.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      slug: "payments",
      models: ["m1"],
      tags: [{ key: "environment", value: "prod" }],
      firstAdmin: { email: "lead@example.com" },
    });
    expect(await screen.findByText("elsewhere")).toBeTruthy(); // navigated back to /teams
  });

  it("Previous returns to the earlier step with the values kept", async () => {
    open();
    await fillDetails();
    await userEvent.click(next());
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("payments");
  });

  it("Cancel leaves without creating", async () => {
    const { port } = open();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
    expect(port.create).not.toHaveBeenCalled();
  });

  it("without teams:create the wizard explains and does not create", async () => {
    const { port } = open({}, serviceAdminWith(ALL_PERMS.filter((p) => p !== "teams:create")));
    await fillAll();
    expect(screen.getByText(/Requires service admin to create teams/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Create team" }));
    expect(port.create).not.toHaveBeenCalled();
  });
});

describe("S3 required tags and provider (M1-T6)", () => {
  it("shows required service tags as selects with their allowed values and blocks Next without them", async () => {
    open();
    const select = await screen.findByLabelText("Tag: environment");
    expect([...(select as HTMLSelectElement).options].map((o) => o.value)).toEqual([
      "",
      "prod",
      "dev",
    ]);
    await userEvent.type(screen.getByLabelText("Display name"), "Payments");
    await userEvent.type(screen.getByLabelText("Slug"), "payments");
    expect(next().getAttribute("aria-disabled")).toBe("true");
  });

  it("a server ValidationError highlights the named fields", async () => {
    const create = vi.fn(async () => {
      throw new AppError({
        kind: "validation",
        message: "Invalid team",
        requestId: "req_v",
        fields: { slug: "Slug is already taken", maxBudgetUsd: "Above the service limit" },
      });
    });
    open({ create });
    await fillAll();
    await userEvent.click(screen.getByRole("button", { name: "Create team" }));
    expect(await screen.findByText("Invalid team")).toBeTruthy();
    expect(screen.getByText(/Request id: req_v/)).toBeTruthy();
    expect(screen.getByText(/slug: Slug is already taken/)).toBeTruthy();
    for (let i = 0; i < 4; i++)
      await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByText("Slug is already taken")).toBeTruthy();
  });

  it("the sign-in provider select appears only with more than one provider, default chosen", async () => {
    const { unmount } = open({}, SERVICE_ADMIN, [IDPS[0] as (typeof IDPS)[number]]);
    await screen.findByLabelText("Tag: environment");
    expect(screen.queryByLabelText("Sign-in provider")).toBeNull();
    unmount();
    open({}, SERVICE_ADMIN, IDPS);
    const sel = (await screen.findByLabelText("Sign-in provider")) as HTMLSelectElement;
    expect(sel.value).toBe("idp_1");
    await userEvent.selectOptions(sel, "idp_2");
    expect(sel.value).toBe("idp_2");
  });

  it("a team created here is a persistent team by default and kind can be switched", async () => {
    open();
    const kind = (await screen.findByLabelText("Kind")) as HTMLSelectElement;
    expect(kind.value).toBe("persistent");
    await userEvent.selectOptions(kind, "ephemeral");
    expect(kind.value).toBe("ephemeral");
    expect(aTeam().kind).toBe("persistent");
  });
});

describe("S3 drafts (FR-004, D-3)", () => {
  const FORM = "s3-create-team";

  it("restores the typed fields after a remount", async () => {
    const drafts = new DraftStore();
    open({}, SERVICE_ADMIN, [], drafts);
    await fillDetails();
    expect(draftIds(drafts)).toEqual([FORM]);
    cleanup();
    open({}, SERVICE_ADMIN, [], drafts);
    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Payments");
    expect((screen.getByLabelText("Slug") as HTMLInputElement).value).toBe("payments");
    expect(((await screen.findByLabelText("Tag: environment")) as HTMLSelectElement).value).toBe(
      "prod",
    );
  });

  it("discards the draft when the team is created", async () => {
    const drafts = new DraftStore();
    const { port } = open({}, SERVICE_ADMIN, [], drafts);
    await fillAll();
    expect(draftIds(drafts)).toEqual([FORM]);
    await userEvent.click(screen.getByRole("button", { name: "Create team" }));
    await waitFor(() => expect(port.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expectNoDraftLeft(drafts));
  });

  it("discards the draft on cancel", async () => {
    const drafts = new DraftStore();
    open({}, SERVICE_ADMIN, [], drafts);
    await fillDetails();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectNoDraftLeft(drafts);
  });

  it("keeps the draft when the create is refused", async () => {
    const drafts = new DraftStore();
    const { port } = open(
      {
        create: vi.fn(async () => {
          throw new AppError({ kind: "unavailable", message: "later" });
        }),
      },
      SERVICE_ADMIN,
      [],
      drafts,
    );
    await fillAll();
    await userEvent.click(screen.getByRole("button", { name: "Create team" }));
    await waitFor(() => expect(port.create).toHaveBeenCalled());
    expect(draftIds(drafts)).toEqual([FORM]);
  });
});
