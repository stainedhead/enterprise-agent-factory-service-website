import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import { AgentsUseCases } from "../../../application/usecases/agents/AgentsUseCases.js";
import { CreateAgentUseCases } from "../../../application/usecases/agents-create/CreateAgentUseCases.js";
import { ConfigUseCases } from "../../../application/usecases/config/ConfigUseCases.js";
import type { Me } from "../../../domain/me.js";
import { agentsServices, fakeAgentsPort } from "../../testing/agents.js";
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
  renderScreen(<T3 />, {
    me: o.me ?? TEAM_ADMIN,
    services: {
      ...teamsServices(teams),
      ...agentsServices(agents),
      ...secretsServices(secrets),
      ...configServices(config),
      createAgent: new CreateAgentUseCases(ag, cf),
    },
    path: "/t/team_1/agents/new",
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
