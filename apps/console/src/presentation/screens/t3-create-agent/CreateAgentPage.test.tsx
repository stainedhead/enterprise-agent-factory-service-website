import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { AgentsUseCases } from "../../../application/usecases/agents/AgentsUseCases.js";
import { CreateAgentUseCases } from "../../../application/usecases/agents-create/CreateAgentUseCases.js";
import { ConfigUseCases } from "../../../application/usecases/config/ConfigUseCases.js";
import { DraftStore } from "../../../application/usecases/session/DraftStore.js";
import type { Me } from "../../../domain/me.js";
import { draftIds, expectNoDraftLeft, withDrafts } from "../../hooks/useDraft.testing.js";
import { agentsServices, anAgent, aTemplate, fakeAgentsPort } from "../../testing/agents.js";
import { TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import {
  aConfigValue,
  aSecret,
  configServices,
  fakeConfigPort,
  fakeSecretsPort,
  secretsServices,
} from "../../testing/secrets.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T3 from "./index.js";
import { IdentitySection, REMOVE_CROSS_ACCOUNT_FIRST } from "./sections/IdentitySection.js";

function open(
  o: {
    me?: Me;
    agents?: ReturnType<typeof fakeAgentsPort>;
    config?: ReturnType<typeof fakeConfigPort>;
    secrets?: ReturnType<typeof fakeSecretsPort>;
    drafts?: DraftStore;
    path?: string;
  } = {},
) {
  const agents = o.agents ?? fakeAgentsPort();
  const config = o.config ?? fakeConfigPort();
  const secrets =
    o.secrets ??
    fakeSecretsPort({
      list: vi.fn(async () => [
        aSecret(),
        aSecret({ id: "sec_3", name: "agent-only", scope: "agent", agentId: "agt_x" }),
        aSecret({ id: "sec_4", name: "pool-only", scope: "pool" }),
      ]),
    });
  const teams = fakeTeamsPort({
    get: vi.fn(async () => aTeam()),
    models: vi.fn(async () => [
      { id: "claude-sonnet", displayName: "Claude Sonnet", provider: "a", enabled: true },
    ]),
  });
  const ag = new AgentsUseCases(agents);
  const cf = new ConfigUseCases(config);
  renderScreen(o.drafts ? withDrafts(<T3 />, o.drafts) : <T3 />, {
    me: o.me ?? TEAM_ADMIN,
    services: {
      ...teamsServices(teams),
      ...agentsServices(agents),
      ...secretsServices(secrets),
      ...configServices(config),
      createAgent: new CreateAgentUseCases(ag, cf),
    },
    path: o.path ?? "/t/team_1/agents/new",
    route: "/t/:teamId/agents/new",
  });
  return { agents, config, secrets };
}

const disabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";
const ready = async () => {
  await screen.findByRole("option", { name: "hermes-dev" });
  await waitFor(() =>
    expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("hermes-dev"),
  );
};

describe("T3 form (M2-C1)", () => {
  it("offers enabled templates only, with the template's defaults and current digest prefilled", async () => {
    open();
    await ready();
    const options = within(screen.getByLabelText("Template"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Choose a template", "hermes-dev", "hermes-ops"]);
    expect((screen.getByLabelText("Image") as HTMLInputElement).value).toBe(
      "ghcr.io/acme/hermes-dev@sha256:4b1e",
    );
    expect((screen.getByLabelText("CPU") as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText("Model") as HTMLSelectElement).value).toBe("claude-sonnet");
    expect(screen.queryByLabelText(/replica/i)).toBeNull();
  });

  it("lists the team's models only and the enabled storage classes", async () => {
    open();
    await ready();
    expect(
      within(screen.getByLabelText("Model"))
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose a model", "Claude Sonnet"]);
    expect(within(screen.getByLabelText("Storage class")).getAllByRole("option")).toHaveLength(1);
  });

  it("switching template prefills that template's digest and resources", async () => {
    open();
    await ready();
    await userEvent.selectOptions(screen.getByLabelText("Template"), "hermes-ops");
    expect((screen.getByLabelText("Image") as HTMLInputElement).value).toBe("x@sha256:1");
  });

  it("creates the agent and goes to it", async () => {
    const { agents } = open();
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(agents.create).toHaveBeenCalled());
    expect(agents.create.mock.calls[0]?.[1]).toMatchObject({
      name: "security-patcher",
      template: "hermes-dev",
      modelId: "claude-sonnet",
    });
  });

  it("shows the API's image refusal on the image field", async () => {
    const agents = fakeAgentsPort({
      create: vi.fn(async () => {
        throw new AppError({
          kind: "validation",
          message: "bad image",
          fields: { image: "Tags are not accepted" },
        });
      }),
    });
    open({ agents });
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    const image = screen.getByLabelText("Image");
    await userEvent.clear(image);
    await userEvent.type(image, "ghcr.io/acme/x:latest");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect((await screen.findAllByText("Tags are not accepted")).length).toBeGreaterThan(0);
  });

  it("client-side errors name the field and send nothing", async () => {
    const { agents } = open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect((await screen.findAllByText(/lower-case letters/)).length).toBeGreaterThan(0);
    expect(agents.create).not.toHaveBeenCalled();
  });

  it("a viewer cannot add rows to the draft either; a team admin can (M6-Q3)", async () => {
    open({ me: VIEWER });
    await ready();
    for (const n of ["Add value", "Add secret binding"])
      expect(disabled(screen.getByRole("button", { name: n })), n).toBe(true);
  });
  it("a team admin can add configuration and secret rows", async () => {
    open({ me: TEAM_ADMIN });
    await ready();
    for (const n of ["Add value", "Add secret binding"])
      expect(disabled(screen.getByRole("button", { name: n })), n).toBe(false);
  });
});

describe("T3 help, bindings, identity, config (M2-C2..C5)", () => {
  it("explains that secrets and configuration arrive as env vars and files", async () => {
    open();
    expect(await screen.findByText(/no code change is needed/)).toBeTruthy();
  });

  it("lists only team-shared secrets for bindings and blocks an env name used by a config value", async () => {
    const { agents } = open();
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Add secret binding" }));
    const sel = screen.getByLabelText("Secret 1");
    expect(
      within(sel)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Choose a secret", "github-bot-key"]);
    await userEvent.selectOptions(sel, "sec_1");
    await userEvent.type(screen.getByLabelText("Target of secret 1"), "LOG_LEVEL");
    await userEvent.click(screen.getByRole("button", { name: "Add value" }));
    await userEvent.type(screen.getByLabelText("Name of value 1"), "LOG_LEVEL");
    await userEvent.type(screen.getByLabelText("Value of LOG_LEVEL"), "info");
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect((await screen.findAllByText(/already a configuration value/)).length).toBeGreaterThan(0);
    expect(agents.create).not.toHaveBeenCalled();
  });

  it("Use namespace value is available only for a name the namespace has, and shows the effective value", async () => {
    open({
      config: fakeConfigPort({
        listNamespace: vi.fn(async () => [aConfigValue({ value: "info" })]),
      }),
    });
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Add value" }));
    await userEvent.type(screen.getByLabelText("Name of value 1"), "LOG_LEVEL");
    await userEvent.selectOptions(screen.getByLabelText("Source of LOG_LEVEL"), "namespace");
    expect(screen.getByText("info")).toBeTruthy();
    expect(screen.getByText("from namespace")).toBeTruthy();
  });

  it("sends configuration values after the agent exists", async () => {
    const { config } = open();
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    await userEvent.click(screen.getByRole("button", { name: "Add value" }));
    await userEvent.type(screen.getByLabelText("Name of value 1"), "MAX_OPEN_PRS");
    await userEvent.type(screen.getByLabelText("Value of MAX_OPEN_PRS"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() =>
      expect(config.putAgent).toHaveBeenCalledWith(
        "team_1",
        "agt_9",
        { name: "MAX_OPEN_PRS" },
        { source: "literal", value: "3" },
      ),
    );
  });

  it("partial failure: a refused configuration value is listed with the T7 link and the agent stays created (FR-021)", async () => {
    const config = fakeConfigPort({
      putAgent: vi.fn(async () => {
        throw new AppError({ kind: "validation", message: "value refused by policy" });
      }),
    });
    const { agents } = open({ config });
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    await userEvent.click(screen.getByRole("button", { name: "Add value" }));
    await userEvent.type(screen.getByLabelText("Name of value 1"), "MAX_OPEN_PRS");
    await userEvent.type(screen.getByLabelText("Value of MAX_OPEN_PRS"), "3");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(agents.create).toHaveBeenCalledOnce());
    const alert = await screen.findByText(/The agent was created, but some configuration values/);
    expect(alert).toBeTruthy();
    expect(screen.getByText(/MAX_OPEN_PRS: value refused by policy/)).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open configuration values" });
    expect(link.getAttribute("href")).toBe("/t/team_1/config");
    // no second create, and the page did not navigate away
    expect(agents.create).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("elsewhere")).toBeNull();
  });

  it("with cross-account links, going back to the shared role is disabled and says why", () => {
    const set = vi.fn();
    render(
      <IdentitySection
        draft={{ iamIdentity: "dedicated" } as never}
        set={set}
        errors={{}}
        crossAccountLinks={2}
      />,
    );
    const shared = screen.getByRole("option", { name: "Team shared role" }) as HTMLOptionElement;
    expect(shared.disabled).toBe(true);
    expect(screen.getByText(REMOVE_CROSS_ACCOUNT_FIRST)).toBeTruthy();
  });
});

describe("T3 CLI panel and viewer (M2-C6)", () => {
  it("the side panel command follows the form", async () => {
    open();
    await ready();
    const panel = screen.getByRole("complementary", { name: "Equivalent CLI" });
    expect(within(panel).getByText(/afs agents create-agent/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    expect(within(panel).getByText(/--name security-patcher/)).toBeTruthy();
    expect(within(panel).getByText(/--template hermes-dev/)).toBeTruthy();
    expect(panel.textContent).not.toMatch(/replica/i);
  });

  it("a viewer cannot submit: Create agent is disabled naming team-admin", async () => {
    const { agents } = open({ me: VIEWER });
    await ready();
    const b = screen.getByRole("button", { name: "Create agent" });
    expect(disabled(b)).toBe(true);
    await userEvent.click(b);
    expect(agents.create).not.toHaveBeenCalled();
  });
});

describe("T3 drafts (FR-004, D-2)", () => {
  const FORM = "t3-create-agent:team_1";

  it("restores non-secret fields after a remount, and keeps the template defaults out of the way", async () => {
    const drafts = new DraftStore();
    const first = open({ drafts });
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    await userEvent.selectOptions(screen.getByLabelText("Template"), "hermes-ops");
    expect(draftIds(drafts)).toEqual([FORM]);
    cleanup();

    open({ drafts, agents: first.agents });
    expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe(
      "security-patcher",
    );
    await screen.findByRole("option", { name: "hermes-ops" });
    // the prefill from the lists must not overwrite what the person had chosen
    await waitFor(() =>
      expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("hermes-ops"),
    );
    expect((screen.getByLabelText("Image") as HTMLInputElement).value).toBe("x@sha256:1");
  });

  it("holds no secret value: bindings carry ids only", async () => {
    const drafts = new DraftStore();
    open({ drafts });
    await ready();
    await userEvent.click(screen.getByRole("button", { name: "Add secret binding" }));
    await userEvent.selectOptions(screen.getByLabelText("Secret 1"), "sec_1");
    expect(JSON.stringify(drafts.snapshot())).not.toMatch(/password|secretValue/i);
  });

  it("discards the draft on successful create", async () => {
    const drafts = new DraftStore();
    const { agents } = open({ drafts });
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    expect(draftIds(drafts)).toEqual([FORM]);
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(agents.create).toHaveBeenCalled());
    await waitFor(() => expectNoDraftLeft(drafts));
  });

  it("discards the draft on cancel", async () => {
    const drafts = new DraftStore();
    open({ drafts });
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expectNoDraftLeft(drafts);
  });

  it("keeps the draft when the create is refused", async () => {
    const drafts = new DraftStore();
    const agents = fakeAgentsPort({
      create: vi.fn(async () => {
        throw new AppError({ kind: "unavailable", message: "try later" });
      }),
    });
    open({ drafts, agents });
    await ready();
    await userEvent.type(screen.getByLabelText("Name"), "security-patcher");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(agents.create).toHaveBeenCalled());
    expect(draftIds(drafts)).toEqual([FORM]);
  });
});

const sent = (a: ReturnType<typeof fakeAgentsPort>) =>
  a.create.mock.calls[0]?.[1] as unknown as { collaboration?: unknown };
const paperclipTpl = aTemplate({
  name: "paperclip-hub",
  capabilities: ["paperclip"],
  currentDigest: "ghcr.io/acme/paperclip@sha256:aa",
  allowedDigests: ["ghcr.io/acme/paperclip@sha256:aa"],
});
function rolePort(opts: { existing?: boolean; templates?: ReturnType<typeof aTemplate>[] } = {}) {
  const all = [aTemplate(), paperclipTpl];
  return fakeAgentsPort({
    list: vi.fn(async (_t: string, _s?: AbortSignal, o?: { role?: string }) =>
      o?.role === "collaboration" && opts.existing
        ? [anAgent({ id: "agt_hub", role: "collaboration" })]
        : [],
    ) as never,
    templates: vi.fn(async (_s?: AbortSignal, o?: { capability?: string }) =>
      o?.capability === "paperclip" ? (opts.templates ?? [paperclipTpl]) : all,
    ) as never,
  });
}

describe("T3 role step (WEB-US-45)", () => {
  it("role step: worker by default, without paperclip templates", async () => {
    open({ agents: rolePort() });
    await ready();
    expect((screen.getByRole("radio", { name: "Worker" }) as HTMLInputElement).checked).toBe(true);
    const options = within(screen.getByLabelText("Template"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).not.toContain("paperclip-hub");
  });
  it("collaboration disabled when one exists", async () => {
    open({ agents: rolePort({ existing: true }) });
    await ready();
    expect(await screen.findByText(/already has a collaboration agent/)).toBeTruthy();
    const r = screen.getByRole("radio", { name: "Collaboration (Paperclip)" });
    expect(r.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(r);
    expect((screen.getByRole("radio", { name: "Worker" }) as HTMLInputElement).checked).toBe(true);
  });
  it("only paperclip templates, dedicated identity forced, snapshot off not offered", async () => {
    open({ agents: rolePort(), path: "/t/team_1/agents/new?role=collaboration" });
    await waitFor(() =>
      expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("paperclip-hub"),
    );
    const options = within(screen.getByLabelText("Template"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["Choose a template", "paperclip-hub"]);
    const iam = screen.getByLabelText("IAM identity") as HTMLSelectElement;
    expect(iam.value).toBe("dedicated");
    expect(iam.getAttribute("aria-disabled")).toBe("true");
    const sched = screen.getByLabelText("Snapshot backups") as HTMLSelectElement;
    expect(within(sched).queryByRole("option", { name: "Off" })).toBeNull();
    expect(sched.value).toBe("daily");
    expect((screen.getByLabelText("Snapshots to keep") as HTMLInputElement).value).toBe("14");
    expect(screen.getByText(/Paperclip's data lives on this agent's volume/)).toBeTruthy();
  });
  it("says so when no Paperclip template is enabled", async () => {
    open({ agents: rolePort({ templates: [] }), path: "/t/team_1/agents/new?role=collaboration" });
    expect(await screen.findByText("No Paperclip template is enabled")).toBeTruthy();
  });
  it("cli for collaboration role, and the request carries the role", async () => {
    const agents = rolePort();
    open({ agents, path: "/t/team_1/agents/new?role=collaboration" });
    await waitFor(() =>
      expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("paperclip-hub"),
    );
    await userEvent.type(screen.getByLabelText("Name"), "paperclip-hub");
    expect(screen.getAllByText(/--role collaboration/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(agents.create).toHaveBeenCalled());
    const body = agents.create.mock.calls[0]?.[1] as unknown as Record<string, unknown>;
    expect(body).toMatchObject({ role: "collaboration", iamIdentity: "dedicated" });
    expect(body.collaboration).toBeUndefined();
    expect((body.volume as Record<string, unknown>).snapshotRetain).toBe(14);
  });
  it("connect switch default on when the team has Paperclip, sent as collaboration.connect", async () => {
    const agents = rolePort({ existing: true });
    open({ agents });
    await ready();
    const sw = await screen.findByRole("switch", { name: "Connect to Paperclip" });
    await waitFor(() => expect((sw as HTMLInputElement).checked).toBe(true));
    expect(screen.getByText(/joins the team's Paperclip board/)).toBeTruthy();
    expect(screen.getAllByText(/--collaboration-connect/).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText("Name"), "worker-one");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(agents.create).toHaveBeenCalled());
    expect(sent(agents).collaboration).toEqual({
      connect: true,
    });
  });
  it("connect switch is off and disabled without a collaboration agent", async () => {
    const agents = rolePort();
    open({ agents });
    await ready();
    const sw = await screen.findByRole("switch", { name: "Connect to Paperclip" });
    expect(sw.getAttribute("aria-disabled")).toBe("true");
    expect((sw as HTMLInputElement).checked).toBe(false);
    // the label and the reason are visible text, not only a tooltip
    expect(screen.getByText("Connect to Paperclip", { selector: "label" })).toBeTruthy();
    expect(
      screen.getByText(/Create one with the Collaboration \(Paperclip\) role first/),
    ).toBeTruthy();
    await userEvent.type(screen.getByLabelText("Name"), "worker-two");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(agents.create).toHaveBeenCalled());
    expect(sent(agents).collaboration).toBeUndefined();
  });
  it("409 collaboration_agent_exists shows the same text on the step", async () => {
    const agents = rolePort();
    agents.create.mockRejectedValue(
      new AppError({ kind: "conflict", message: "exists", reason: "collaboration_agent_exists" }),
    );
    open({ agents, path: "/t/team_1/agents/new?role=collaboration" });
    await waitFor(() =>
      expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("paperclip-hub"),
    );
    await userEvent.type(screen.getByLabelText("Name"), "paperclip-hub");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(await screen.findByText(/already has a collaboration agent/)).toBeTruthy();
  });
  it("503 keeps the form", async () => {
    const agents = rolePort();
    agents.create.mockRejectedValue(
      new AppError({ kind: "unavailable", message: "Boot secrets could not be written" }),
    );
    open({ agents, path: "/t/team_1/agents/new?role=collaboration" });
    await waitFor(() =>
      expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("paperclip-hub"),
    );
    await userEvent.type(screen.getByLabelText("Name"), "paperclip-hub");
    await userEvent.click(screen.getByRole("button", { name: "Create agent" }));
    expect(await screen.findByText("Boot secrets could not be written")).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("paperclip-hub");
  });
  it("switching to worker restores shared identity and offers worker templates", async () => {
    open({ agents: rolePort(), path: "/t/team_1/agents/new?role=collaboration" });
    await waitFor(() =>
      expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("paperclip-hub"),
    );
    await userEvent.click(screen.getByRole("radio", { name: "Worker" }));
    await waitFor(() =>
      expect((screen.getByLabelText("Template") as HTMLSelectElement).value).toBe("hermes-dev"),
    );
    expect((screen.getByLabelText("IAM identity") as HTMLSelectElement).value).toBe("team_shared");
  });
});
