import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { agentsServices, anAgent, fakeAgentsPort } from "../../testing/agents.js";
import { VIEWER as HARNESS_VIEWER, TEAM_ADMIN } from "../../testing/harness.js";
import {
  aRevision,
  fakeAuditPort,
  fakeRevisionsPort,
  historyServices,
} from "../../testing/history.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, status, teamsServices } from "../../testing/teams.js";
import T2 from "./index.js";

function open(
  o: {
    me?: Me;
    path?: string;
    agents?: ReturnType<typeof fakeAgentsPort>;
    team?: ReturnType<typeof aTeam>;
  } = {},
) {
  const agents = o.agents ?? fakeAgentsPort();
  const teams = fakeTeamsPort({
    get: vi.fn(async () => o.team ?? aTeam()),
    models: vi.fn(async () => [
      { id: "claude-sonnet", displayName: "Claude Sonnet", provider: "anthropic", enabled: true },
    ]),
  });
  const history = historyServices(
    fakeAuditPort(),
    fakeRevisionsPort({
      list: vi.fn(async () => ({
        items: [aRevision(3, { resourceKind: "agent", resourceId: "agt_1" })],
      })),
    }),
  );
  renderScreen(<T2 />, {
    me: o.me ?? TEAM_ADMIN,
    services: { ...teamsServices(teams), ...agentsServices(agents), ...history },
    path: o.path ?? "/t/team_1/agents",
    route: "/t/:teamId/agents/:agentId?",
  });
  return { agents, teams };
}

const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("T2 table (M2-A2)", () => {
  it("lists name, status, model, template, bound secrets and cost, with no replica column", async () => {
    open();
    const row = (await screen.findByText("reviewer-bot")).closest("tr") as HTMLElement;
    expect(within(row).getByText("Ready")).toBeTruthy();
    expect(within(row).getByText("claude-sonnet")).toBeTruthy();
    expect(within(row).getByText("hermes-dev")).toBeTruthy();
    expect(within(row).getByText("1 secret")).toBeTruthy();
    expect(within(row).getByText("$12,980.00")).toBeTruthy();
    expect(screen.getByText("Paused")).toBeTruthy();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers.join(" ")).not.toMatch(/replica/i);
    expect(screen.queryByRole("button", { name: /scale/i })).toBeNull();
  });

  it("shows Budget blocked for a ready agent with BudgetExhausted", async () => {
    const blocked = anAgent({
      status: {
        ...status(),
        conditions: [{ type: "BudgetExhausted", status: "True", lastTransitionTime: "x" }],
      },
    });
    open({ agents: fakeAgentsPort({ list: vi.fn(async () => [blocked]) }) });
    expect(await screen.findByText("Budget blocked")).toBeTruthy();
  });
});

describe("T2 panel (M2-A3, A4, A5)", () => {
  it("restarts, and pauses after confirming", async () => {
    const { agents } = open({ path: "/t/team_1/agents/agt_1" });
    await userEvent.click(await screen.findByRole("button", { name: "Restart" }));
    await waitFor(() => expect(agents.restart).toHaveBeenCalledWith("team_1", "agt_1"));
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Pause" }),
    );
    await waitFor(() => expect(agents.pause).toHaveBeenCalledWith("team_1", "agt_1"));
  });

  it("offers Resume for a paused agent", async () => {
    const { agents } = open({ path: "/t/team_1/agents/agt_2" });
    await userEvent.click(await screen.findByRole("button", { name: "Resume" }));
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Resume" }),
    );
    await waitFor(() => expect(agents.resume).toHaveBeenCalledWith("team_1", "agt_2"));
  });

  it("takes a snapshot with a description", async () => {
    const { agents } = open({ path: "/t/team_1/agents/agt_1" });
    await userEvent.click(await screen.findByRole("button", { name: "Take snapshot" }));
    await userEvent.type(
      within(screen.getByRole("dialog")).getByLabelText("Description"),
      "pre-upgrade",
    );
    await userEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Take snapshot" }),
    );
    await waitFor(() =>
      expect(agents.createSnapshot).toHaveBeenCalledWith("team_1", "agt_1", "pre-upgrade"),
    );
  });

  it("shows the generation note while a change is not applied", async () => {
    open({
      path: "/t/team_1/agents/agt_1",
      agents: fakeAgentsPort({
        list: vi.fn(async () => [anAgent({ generation: 3, status: status("Reconciling", 2) })]),
      }),
    });
    expect(await screen.findByText(/Change not applied yet/)).toBeTruthy();
  });

  it("expands the volume only to a larger size, and shows the API's refusal", async () => {
    const agents = fakeAgentsPort({
      update: vi.fn(async () => {
        throw new AppError({
          kind: "validation",
          message: "Exceeds the team storage quota",
          requestId: "req_q",
        });
      }),
    });
    open({ path: "/t/team_1/agents/agt_1", agents });
    await userEvent.click(await screen.findByRole("button", { name: "Expand volume" }));
    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText("New size (GiB)");
    await userEvent.clear(input);
    await userEvent.type(input, "40");
    expect(disabled(within(dialog).getByRole("button", { name: "Expand" }))).toBe(true);
    expect(agents.update).not.toHaveBeenCalled();
    await userEvent.clear(input);
    await userEvent.type(input, "80");
    await userEvent.click(within(dialog).getByRole("button", { name: "Expand" }));
    expect(await within(dialog).findByText(/Exceeds the team storage quota/)).toBeTruthy();
    expect(agents.update).toHaveBeenCalledWith(
      "team_1",
      { id: "agt_1", version: 4 },
      { volume: { sizeGiB: 80 } },
    );
  });

  it("the Logs tab lists log destinations and the CLI, never log content (WD-29)", async () => {
    open({ path: "/t/team_1/agents/agt_1" });
    await userEvent.click(await screen.findByRole("tab", { name: "Logs" }));
    expect(await screen.findByText("central-cloudwatch")).toBeTruthy();
    expect(screen.getByText(/afs teams list-log-destinations/)).toBeTruthy();
  });

  it("the Revisions tab reads revisions of this agent only", async () => {
    open({ path: "/t/team_1/agents/agt_1" });
    await userEvent.click(await screen.findByRole("tab", { name: "Revisions" }));
    expect(await screen.findByText("#3")).toBeTruthy();
  });
});

describe("T2 template retired (M2-A7)", () => {
  const retired = anAgent({
    status: {
      ...status(),
      conditions: [{ type: "TemplateRetired", status: "True", lastTransitionTime: "x" }],
    },
  });
  it("shows Template retired and Edit needs a new template or digest", async () => {
    const agents = fakeAgentsPort({
      list: vi.fn(async () => [retired]),
      get: vi.fn(async () => retired),
    });
    open({ path: "/t/team_1/agents/agt_1", agents });
    expect((await screen.findAllByText("Template retired")).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(disabled(within(dialog).getByRole("button", { name: "Save" }))).toBe(true);
    const image = within(dialog).getByLabelText("Image");
    await userEvent.clear(image);
    await userEvent.type(image, "ghcr.io/acme/omp-review@sha256:aaaa");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(agents.update).toHaveBeenCalledWith(
        "team_1",
        { id: "agt_1", version: 4 },
        { image: "ghcr.io/acme/omp-review@sha256:aaaa" },
      ),
    );
  });

  it("a 412 on Edit offers a reload and keeps the edits", async () => {
    const agents = fakeAgentsPort({
      update: vi.fn(async () => {
        throw new AppError({ kind: "stale", message: "changed" });
      }),
    });
    open({ path: "/t/team_1/agents/agt_1", agents });
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const d = within(screen.getByRole("dialog"));
    await userEvent.type(d.getByLabelText("Description"), "new text");
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: /Reload/ })).toBeTruthy();
    expect((d.getByLabelText("Description") as HTMLInputElement).value).toBe("new text");
  });
});

describe("T2 viewer (M2-A6)", () => {
  const viewer: Me = HARNESS_VIEWER;
  it("shows the same panel with every action disabled, naming team-admin", async () => {
    const { agents } = open({ me: viewer, path: "/t/team_1/agents/agt_1" });
    for (const name of [
      "Restart",
      "Pause",
      "Take snapshot",
      "Edit",
      "Expand volume",
      "Create agent",
    ]) {
      expect(disabled(await screen.findByRole("button", { name }))).toBe(true);
    }
    await userEvent.hover(screen.getByRole("button", { name: "Restart" }));
    expect((await screen.findByRole("tooltip")).textContent).toBe("Requires team-admin");
    await userEvent.click(screen.getByRole("button", { name: "Restart" }));
    expect(agents.restart).not.toHaveBeenCalled();
  });

  it("a suspended team disables the actions too", async () => {
    open({ path: "/t/team_1/agents/agt_1", team: aTeam({ state: "suspended" }) });
    await waitFor(() =>
      expect(disabled(screen.getByRole("button", { name: "Restart" }))).toBe(true),
    );
  });

  it("a denied restart is left to the access-denied banner, not shown as an error here", async () => {
    const agents = fakeAgentsPort({
      restart: vi.fn(async () => {
        throw new AppError({ kind: "access-denied", message: "denied" });
      }),
    });
    open({ path: "/t/team_1/agents/agt_1", agents });
    await userEvent.click(await screen.findByRole("button", { name: "Restart" }));
    await waitFor(() => expect(agents.restart).toHaveBeenCalled());
    expect(screen.queryByText("The action was not applied")).toBeNull();
  });
});

describe("T2 collaboration (WEB-US-53)", () => {
  const withRoles = () =>
    fakeAgentsPort({
      list: vi.fn(async () => [
        anAgent({
          id: "agt_hub",
          name: "paperclip-hub",
          role: "collaboration",
        }),
        anAgent({
          id: "agt_1",
          name: "reviewer-bot",
          role: "worker",
          collaboration: { connect: true, linkState: "linked" },
        }),
        anAgent({
          id: "agt_2",
          name: "incident-scribe",
          role: "worker",
          collaboration: { connect: false, linkState: "disabled" },
        }),
        anAgent({ id: "agt_3", name: "plain-worker" }),
      ]),
    });
  it("collaboration badge and paperclip column", async () => {
    open({ agents: withRoles() });
    const t = await screen.findByRole("table", { name: "Agents" });
    const hub = (await within(t).findByText("paperclip-hub")).closest("tr") as HTMLElement;
    expect(within(hub).getByText("Collaboration")).toBeTruthy();
    expect(within(hub).getByText("—")).toBeTruthy();
    const w1 = within(t).getByText("reviewer-bot").closest("tr") as HTMLElement;
    expect(within(w1).getByText("linked")).toBeTruthy();
    const w2 = within(t).getByText("incident-scribe").closest("tr") as HTMLElement;
    expect(within(w2).getByText("Not connected")).toBeTruthy();
    expect(
      within(within(t).getByText("plain-worker").closest("tr") as HTMLElement).getByText(
        "Not connected",
      ),
    ).toBeTruthy();
  });
  it("role filter follows the URL", async () => {
    open({ agents: withRoles(), path: "/t/team_1/agents?role=collaboration" });
    const t = await screen.findByRole("table", { name: "Agents" });
    expect(await within(t).findByText("paperclip-hub")).toBeTruthy();
    expect(within(t).queryByText("reviewer-bot")).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Role"), "worker");
    expect(await within(t).findByText("reviewer-bot")).toBeTruthy();
    expect(within(t).queryByText("paperclip-hub")).toBeNull();
  });
});
