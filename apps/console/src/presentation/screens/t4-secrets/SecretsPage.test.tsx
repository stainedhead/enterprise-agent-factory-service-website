import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { agentsServices, fakeAgentsPort } from "../../testing/agents.js";
import { externalSystemsServices, fakeExternalSystemsPort } from "../../testing/externalSystems.js";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import { aSecret, fakeSecretsPort, secretsServices } from "../../testing/secrets.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T4 from "./index.js";
import V2 from "./viewer.js";

const SENTINEL = "s3ntinel-value-123";

function open(o: { me?: Me; viewer?: boolean; secrets?: ReturnType<typeof fakeSecretsPort> } = {}) {
  const secrets = o.secrets ?? fakeSecretsPort();
  const teams = fakeTeamsPort({ get: vi.fn(async () => aTeam()) });
  const view = renderScreen(o.viewer ? <V2 /> : <T4 />, {
    me: o.me ?? TEAM_ADMIN,
    services: {
      ...teamsServices(teams),
      ...agentsServices(fakeAgentsPort()),
      ...secretsServices(secrets),
      ...externalSystemsServices(fakeExternalSystemsPort()),
    },
    path: "/t/team_1/secrets",
    route: "/t/:teamId/secrets",
  });
  return { secrets, ...view };
}
const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("T4 table (M2-S3)", () => {
  it("shows scope, managed path, usage by agent name, rotation, last change and Write-only", async () => {
    open();
    const row = (await screen.findByText("github-bot-key")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Team shared")).toBeTruthy();
    expect(within(row).getByText("afs/afs-alpha/github-bot-key")).toBeTruthy();
    expect(await within(row).findByRole("link", { name: "reviewer-bot" })).toBeTruthy();
    expect(within(row).getByText("Every 90 days")).toBeTruthy();
    expect(within(row).getByText("Write-only")).toBeTruthy();
  });
  it("V2 shows no value column and no row actions", async () => {
    open({ me: VIEWER, viewer: true });
    await screen.findByText("github-bot-key");
    expect(screen.queryByText("Write-only")).toBeNull();
    expect(screen.queryByRole("button", { name: /Rotate|Delete/ })).toBeNull();
    expect(disabled(screen.getByRole("button", { name: "Create secret" }))).toBe(true);
  });
});

describe("T4 create (M2-S2, S6)", () => {
  it("previews the path, the CLI with file://, sends the value once and empties the input", async () => {
    const { secrets, queryClient } = open();
    await screen.findByText("github-bot-key");
    await userEvent.click(screen.getByRole("button", { name: "Create secret" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Name"), "pagerduty-token");
    await userEvent.type(d.getByLabelText("Secret value"), SENTINEL);
    expect(d.getByText("afs/afs-alpha/pagerduty-token")).toBeTruthy();
    expect(d.getByText(/afs secrets create-secret .*--secret-value file:\/\/<path>/)).toBeTruthy();
    expect(screen.getByRole("dialog").textContent).not.toContain(SENTINEL);
    await userEvent.click(d.getByRole("button", { name: "Create secret" }));
    await waitFor(() => expect(secrets.create).toHaveBeenCalledTimes(1));
    expect(secrets.create.mock.calls[0]?.[2]).toBe(SENTINEL);
    expect(JSON.stringify(secrets.create.mock.calls[0]?.[1])).not.toContain(SENTINEL);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.innerHTML).not.toContain(SENTINEL);
    expect(
      JSON.stringify(
        queryClient
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain(SENTINEL);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("clears the value when the request fails", async () => {
    const secrets = fakeSecretsPort({
      create: vi.fn(async () => {
        throw new AppError({ kind: "validation", message: "bad", fields: { name: "Taken" } });
      }),
    });
    open({ secrets });
    await screen.findByText("github-bot-key");
    await userEvent.click(screen.getByRole("button", { name: "Create secret" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Name"), "pagerduty-token");
    await userEvent.type(d.getByLabelText("Secret value"), SENTINEL);
    await userEvent.click(d.getByRole("button", { name: "Create secret" }));
    expect(await d.findByText("Taken")).toBeTruthy();
    expect((d.getByLabelText("Secret value") as HTMLInputElement).value).toBe("");
    expect(document.body.innerHTML).not.toContain(SENTINEL);
  });

  it("refuses a missing value before any request", async () => {
    const { secrets } = open();
    await screen.findByText("github-bot-key");
    await userEvent.click(screen.getByRole("button", { name: "Create secret" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Name"), "pagerduty-token");
    await userEvent.click(d.getByRole("button", { name: "Create secret" }));
    expect(await d.findByText("Enter the secret value")).toBeTruthy();
    expect(secrets.create).not.toHaveBeenCalled();
  });
});

describe("T4 rotate and delete (M2-S4, S5)", () => {
  it("rotate names the agents that restart and never keeps the value", async () => {
    const { secrets, queryClient } = open();
    await userEvent.click(await screen.findByRole("button", { name: "Rotate github-bot-key" }));
    const d = within(screen.getByRole("dialog"));
    expect(await d.findByText(/reviewer-bot/)).toBeTruthy();
    await userEvent.type(d.getByLabelText("New secret value"), SENTINEL);
    await userEvent.click(d.getByRole("button", { name: "Rotate" }));
    await waitFor(() => expect(secrets.rotate).toHaveBeenCalledWith("team_1", "sec_1", SENTINEL));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.innerHTML).not.toContain(SENTINEL);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it("deleting a bound secret shows the API's 409 with each agent linked", async () => {
    const secrets = fakeSecretsPort({
      delete: vi.fn(async () => {
        throw new AppError({ kind: "conflict", message: "in use", requestId: "req_9" });
      }),
    });
    open({ secrets });
    await userEvent.click(await screen.findByRole("button", { name: "Delete github-bot-key" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    const alert = await screen.findByText(/is bound to agents/);
    const box = alert.closest("[role=alert]") as HTMLElement;
    await waitFor(() =>
      expect(within(box).getByRole("link", { name: "reviewer-bot" }).getAttribute("href")).toBe(
        "/t/team_1/agents/agt_1",
      ),
    );
    expect(secrets.delete).toHaveBeenCalledWith("team_1", { id: "sec_1", version: 3 });
  });

  it("uses the dependents the API names when it names them", async () => {
    const secrets = fakeSecretsPort({
      delete: vi.fn(async () => {
        throw new AppError({ kind: "conflict", message: "in use", details: { agents: ["agt_2"] } });
      }),
    });
    open({ secrets });
    await userEvent.click(await screen.findByRole("button", { name: "Delete github-bot-key" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }),
    );
    expect(await screen.findByRole("link", { name: "incident-scribe" })).toBeTruthy();
  });

  it("a viewer's controls are disabled naming team-admin", async () => {
    const { secrets } = open({ me: VIEWER });
    await screen.findByText("github-bot-key");
    for (const name of ["Create secret", "Rotate github-bot-key", "Delete github-bot-key"])
      expect(disabled(screen.getByRole("button", { name }))).toBe(true);
    await userEvent.hover(screen.getByRole("button", { name: "Create secret" }));
    expect((await screen.findByRole("tooltip")).textContent).toBe("Requires team-admin");
    expect(secrets.create).not.toHaveBeenCalled();
    void aSecret;
  });
});

describe("T4 managed secrets (WEB-US-54)", () => {
  const managedList = () =>
    fakeSecretsPort({
      list: vi.fn(async () => [
        aSecret(),
        aSecret({
          id: "sec_afs",
          name: "paperclip-better-auth-secret",
          managedBy: "afs",
          boundTo: [],
          agentId: "agt_hub",
          scope: "agent",
        }),
        aSecret({
          id: "sec_master",
          name: "paperclip-secrets-master-key",
          managedBy: "afs",
          boundTo: [],
          scope: "agent",
        }),
        aSecret({
          id: "sec_pc",
          name: "paperclip-agent-key",
          managedBy: "paperclip",
          boundTo: [],
          scope: "agent",
        }),
      ]),
    });
  const rowOf = async (name: string) =>
    (await screen.findByText(name)).closest("tr") as HTMLElement;

  it("managed by column and filter", async () => {
    open({ secrets: managedList() });
    const r = await rowOf("paperclip-better-auth-secret");
    expect(within(r).getByText("Managed by AFS")).toBeTruthy();
    expect(
      within(await rowOf("paperclip-agent-key")).getByText("Managed by Paperclip"),
    ).toBeTruthy();
    expect(within(await rowOf("github-bot-key")).getAllByText("Team").length).toBeGreaterThan(0);
    await userEvent.selectOptions(screen.getByLabelText("Managed by"), "paperclip");
    expect(screen.queryByText("github-bot-key")).toBeNull();
    expect(screen.getByText("paperclip-agent-key")).toBeTruthy();
  });
  it("managed rows are read-only with tooltips", async () => {
    open({ secrets: managedList() });
    const r = await rowOf("paperclip-agent-key");
    expect(disabled(within(r).getByRole("button", { name: "Delete paperclip-agent-key" }))).toBe(
      true,
    );
    expect(disabled(within(r).getByRole("button", { name: "Rotate paperclip-agent-key" }))).toBe(
      true,
    );
    expect(within(r).getByText("Not bindable")).toBeTruthy();
    const a = await rowOf("paperclip-better-auth-secret");
    expect(
      disabled(within(a).getByRole("button", { name: "Delete paperclip-better-auth-secret" })),
    ).toBe(true);
  });
  it("master key rotate disabled", async () => {
    open({ secrets: managedList() });
    const r = await rowOf("paperclip-secrets-master-key");
    expect(
      disabled(within(r).getByRole("button", { name: "Rotate paperclip-secrets-master-key" })),
    ).toBe(true);
  });
  it("rotate afs row has no value field and sends no value", async () => {
    const { secrets } = open({ secrets: managedList() });
    const r = await rowOf("paperclip-better-auth-secret");
    await userEvent.click(
      within(r).getByRole("button", { name: "Rotate paperclip-better-auth-secret" }),
    );
    const d = within(screen.getByRole("dialog"));
    expect(d.getByText(/AFS generates the new value/)).toBeTruthy();
    expect(d.queryByLabelText("New secret value")).toBeNull();
    await userEvent.click(d.getByRole("button", { name: "Rotate" }));
    await waitFor(() => expect(secrets.rotate).toHaveBeenCalled());
    expect(secrets.rotate.mock.calls[0]).toEqual(["team_1", "sec_afs"]);
  });
  it("a managed row cannot be deleted from the table", async () => {
    const secrets = managedList();
    secrets.delete.mockRejectedValue(
      new AppError({ kind: "conflict", message: "no", reason: "managed_secret" }),
    );
    // a team-owned row whose delete the API refuses
    secrets.list.mockResolvedValue([
      aSecret({ managedBy: "afs", id: "sec_x", name: "forced-one" }),
    ]);
    open({ secrets });
    const r = await rowOf("forced-one");
    expect(disabled(within(r).getByRole("button", { name: "Delete forced-one" }))).toBe(true);
  });
});
