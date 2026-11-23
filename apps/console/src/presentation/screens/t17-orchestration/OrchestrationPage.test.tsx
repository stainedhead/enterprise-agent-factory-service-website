import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { agentsServices, anAgent, fakeAgentsPort } from "../../testing/agents.js";
import {
  aLink,
  collaborationServices,
  type FakeCollaborationPort,
  fakeCollaborationPort,
} from "../../testing/collaboration.js";
import { SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import {
  aMember,
  fakeApiKeysPort,
  fakeMembersPort,
  membersServices,
} from "../../testing/members.js";
import {
  aBuzzOrchestration,
  anOrchestration,
  aSurface,
  type FakeOrchestrationPort,
  fakeOrchestrationPort,
  orchestrationServices,
} from "../../testing/orchestration.js";
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T17 from "./index.js";
import V4 from "./viewer.js";

function open(
  o: {
    me?: Me;
    port?: FakeCollaborationPort;
    orch?: FakeOrchestrationPort;
    suspended?: boolean;
    viewer?: boolean;
    path?: string;
    members?: ReturnType<typeof fakeMembersPort>;
  } = {},
) {
  const port = o.port ?? fakeCollaborationPort();
  const orch = o.orch ?? fakeOrchestrationPort();
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam(o.suspended ? { state: "suspended" } : {}));
  const agents = fakeAgentsPort({
    list: async (_t, _s, q) =>
      q?.role === "orchestration"
        ? [
            anAgent({
              id: "agt_orch",
              name: "orchestrator",
              role: "orchestration",
              template: null,
              image: null,
            }),
          ]
        : [anAgent(), anAgent({ id: "agt_2", name: "incident-scribe" })],
  });
  renderScreen(o.viewer ? <V4 /> : <T17 />, {
    me: o.me ?? TEAM_ADMIN,
    services: {
      ...collaborationServices(port),
      ...orchestrationServices(orch),
      ...agentsServices(agents),
      ...teamsServices(teams),
      ...(o.members ? membersServices(o.members, fakeApiKeysPort()) : {}),
    },
    path: o.path ?? "/t/team_1/orchestration",
    route: "/t/:teamId/orchestration/:tab?",
  });
  return { port, orch };
}

const _level = (name: string, option: string) =>
  within(screen.getByRole("radiogroup", { name })).getByRole("radio", { name: option });

describe("T17 orchestration page", () => {
  it("status panel shows the tool, the runtime and the four conditions, never the harness", async () => {
    open();
    expect(await screen.findByText("Paperclip AI 1.4")).toBeTruthy();
    const status = screen.getByRole("region", { name: "Status" });
    for (const t of ["EndpointReady", "ToolReady", "RegistrationHealthy", "UnmanagedToolAgents"])
      expect(within(status).getByText(t)).toBeTruthy();
    expect(within(status).getByText("Orchestration runtime")).toBeTruthy();
    expect(within(status).getAllByText("Orchestration").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/openclaw|hermes/i);
  });
  it("says a change is not applied yet and lists unmanaged agents", async () => {
    open({
      orch: fakeOrchestrationPort({
        get: async () =>
          anOrchestration({ observedGeneration: 3, unmanagedToolAgents: ["pc-rogue"] }),
      }),
    });
    expect(await screen.findByText("Change not applied yet")).toBeTruthy();
    expect(screen.getByText(/pc-rogue/)).toBeTruthy();
  });
  it("shows each surface with its effective level and address", async () => {
    open();
    const ep = await screen.findByRole("region", { name: "Endpoints" });
    expect(within(ep).getByText("Private")).toBeTruthy();
    expect(within(ep).getByText("https://alpha.collab.example.test/")).toBeTruthy();
    expect(within(ep).getByText("Off")).toBeTruthy();
    expect(
      within(ep).getAllByText(/afs orchestration describe-orchestration/).length,
    ).toBeGreaterThan(0);
  });
  it("Buzz shows N/A on both surfaces and never offers a level", async () => {
    open({ orch: fakeOrchestrationPort({ get: async () => aBuzzOrchestration() }) });
    const ep = await screen.findByRole("region", { name: "Endpoints" });
    expect(within(ep).getAllByText(/N\/A for Buzz/).length).toBe(2);
    expect(within(ep).getByRole("link", { name: "Open Buzz" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });
  it("a team the backfill has not reached shows the pending banner and loads nothing else", async () => {
    const { port } = open({
      orch: fakeOrchestrationPort({
        get: async () => {
          throw new AppError({
            kind: "not-found",
            message: "none",
            reason: "orchestration_agent_pending",
          });
        },
      }),
    });
    expect(await screen.findByText("Orchestration agent being created")).toBeTruthy();
    expect(port.listLinks).not.toHaveBeenCalled();
    expect(port.recentAccess).not.toHaveBeenCalled();
  });
  it("a failing load shows its own error", async () => {
    open({
      orch: fakeOrchestrationPort({
        get: async () => {
          throw new AppError({ kind: "unavailable", message: "down", requestId: "req_5" });
        },
      }),
    });
    expect(await screen.findByText("Orchestration could not be loaded")).toBeTruthy();
  });
  it("Open tool is a link when everything is ready", async () => {
    open();
    const a = await screen.findByRole("link", { name: "Open Paperclip AI" });
    expect(a.getAttribute("href")).toBe("https://alpha.collab.example.test/");
    expect(a.getAttribute("target")).toBe("_blank");
  });
  it("Open tool is disabled with its reason while the agent is not Ready or the team is suspended", async () => {
    open({
      orch: fakeOrchestrationPort({ get: async () => anOrchestration({ phase: "Reconciling" }) }),
    });
    expect(
      (await screen.findByRole("link", { name: "Open Paperclip AI" })).getAttribute(
        "aria-disabled",
      ),
    ).toBe("true");
  });
  it("team suspended disables Open", async () => {
    open({ suspended: true });
    const l = await screen.findByRole("link", { name: "Open Paperclip AI" });
    await waitFor(() => expect(l.getAttribute("aria-disabled")).toBe("true"));
  });
  it("a viewer sees the read-only page", async () => {
    open({ me: VIEWER, viewer: true });
    expect(await screen.findByRole("heading", { name: /Read-only/ })).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: /Actions/ }));
    expect(
      screen.getByRole("menuitem", { name: "Edit endpoints" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
  it("a service admin keeps the page usable", async () => {
    open({ me: SERVICE_ADMIN });
    expect(await screen.findByRole("region", { name: "Status" })).toBeTruthy();
  });
  it("the agent configuration tab is the shared configuration without collaboration fields", async () => {
    open({ path: "/t/team_1/orchestration/config" });
    expect(await screen.findByText("Orchestration runtime")).toBeTruthy();
    expect(screen.queryByText("Template")).toBeNull();
    expect(screen.queryByText(/Web UI|Web API|Registration/)).toBeNull();
    expect(screen.getByText("Models")).toBeTruthy();
    expect(screen.getByText("Persistent volume")).toBeTruthy();
  });
  it("the collaboration tab has no model or resource fields", async () => {
    open();
    await screen.findByRole("region", { name: "Status" });
    expect(screen.queryByText("Persistent volume")).toBeNull();
    expect(screen.queryByText("Resources")).toBeNull();
  });
});

describe("Edit endpoints and Change tool (WEB-US-44, ORC-11)", () => {
  const choose = async (name: string) => {
    await userEvent.click(await screen.findByRole("button", { name: /Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name }));
    return await screen.findByRole("dialog");
  };
  it("a level above the limit is visible but cannot be chosen, with its reason", async () => {
    open();
    const d = within(await choose("Edit endpoints"));
    const pub = d.getAllByRole("radio", { name: "Public" })[0] as HTMLElement;
    expect(pub.getAttribute("aria-disabled")).toBe("true");
    expect(pub.getAttribute("aria-describedby")).toBeTruthy();
    expect(d.getAllByText(/Above this team's limit \(Private\)/).length).toBeGreaterThan(0);
  });
  it("sends both surfaces and the version after a review with the equivalent command", async () => {
    const { orch } = open();
    const d = within(await choose("Edit endpoints"));
    await userEvent.click(d.getAllByRole("radio", { name: "Private" })[1] as HTMLElement);
    await userEvent.click(d.getByRole("button", { name: "Review" }));
    expect(d.getAllByText(/--web-api-exposure private/).length).toBeGreaterThan(0);
    expect(d.getAllByText(/--if-match 3/).length).toBeGreaterThan(0);
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(orch.put).toHaveBeenCalled());
    expect(orch.put.mock.calls[0]?.[1]).toEqual({ version: 3 });
    expect(orch.put.mock.calls[0]?.[2]).toEqual({ webUi: "private", webApi: "private" });
  });
  it("Public asks with the warning on the review step (limit public)", async () => {
    const { orch } = open({
      orch: fakeOrchestrationPort({ get: async () => anOrchestration({ limit: "public" }) }),
    });
    const d = within(await choose("Edit endpoints"));
    await userEvent.click(d.getAllByRole("radio", { name: "Public" })[0] as HTMLElement);
    await userEvent.click(d.getByRole("button", { name: "Review" }));
    expect(d.getAllByText(/reachable from the internet/).length).toBeGreaterThan(0);
    expect(orch.put).not.toHaveBeenCalled();
  });
  it("the mode is sent only when changed; managed waits for Ready", async () => {
    open({
      orch: fakeOrchestrationPort({ get: async () => anOrchestration({ phase: "Reconciling" }) }),
    });
    const d = within(await choose("Edit endpoints"));
    expect(d.getByRole("radio", { name: "Managed" }).getAttribute("aria-disabled")).toBe("true");
    expect(d.getByText("The orchestration agent must be Ready")).toBeTruthy();
  });
  it("a 412 offers reload and keeps the dialog's choice", async () => {
    const { orch } = open({
      orch: fakeOrchestrationPort({
        put: async () => {
          throw new AppError({ kind: "stale", message: "stale", requestId: "req_1" });
        },
      }),
    });
    const d = within(await choose("Edit endpoints"));
    await userEvent.click(d.getByRole("button", { name: "Review" }));
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/The change was not saved/i)).toBeTruthy();
    expect(orch).toBeDefined();
  });
  it("shows the reason text of a validation error", async () => {
    open({
      orch: fakeOrchestrationPort({
        put: async () => {
          throw new AppError({
            kind: "validation",
            message: "Invalid",
            fields: { "webUi.exposure": "team_limit" },
          });
        },
      }),
    });
    const d = within(await choose("Edit endpoints"));
    await userEvent.click(d.getByRole("button", { name: "Review" }));
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    expect(await d.findByText(/limit/i)).toBeTruthy();
  });
  it("Change tool needs the team slug typed, warns about the data and sends the tool", async () => {
    const { orch } = open();
    const d = within(await choose("Change tool"));
    expect(d.getByText(/starts with an empty data directory/)).toBeTruthy();
    const go = d.getByRole("button", { name: "Change tool" });
    const off = () =>
      (go as HTMLButtonElement).disabled || go.getAttribute("aria-disabled") === "true";
    await waitFor(() => expect(off()).toBe(true));
    await userEvent.type(d.getByLabelText(/Type alpha to confirm/), "alpha");
    await waitFor(() => expect(off()).toBe(false));
    expect(d.getAllByText(/afs orchestration change-collaboration-tool/).length).toBeGreaterThan(0);
    await userEvent.click(go);
    await waitFor(() => expect(orch.changeTool).toHaveBeenCalledWith("team_1", "buzz"));
  });
  it("rotate keys: master key disabled, acknowledgement required, sends the chosen names", async () => {
    const { port } = open();
    const d = within(await choose("Rotate tool keys"));
    expect(
      (d.getByRole("checkbox", { name: "paperclip-secrets-master-key" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    const go = d.getByRole("button", { name: "Rotate" });
    expect(go.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(
      d.getByRole("checkbox", { name: "paperclip-tool-action-signing-secret" }),
    );
    await userEvent.click(d.getByRole("checkbox", { name: /I understand/ }));
    await userEvent.click(go);
    await waitFor(() => expect(port.rotateKeys).toHaveBeenCalled());
    expect(port.rotateKeys.mock.calls[0]?.[1]).toEqual(["paperclip-better-auth-secret"]);
    expect(await screen.findByText(/Everyone is signed out/)).toBeTruthy();
  });
  it("Rotate tool keys is not offered for Buzz", async () => {
    open({ orch: fakeOrchestrationPort({ get: async () => aBuzzOrchestration() }) });
    await userEvent.click(await screen.findByRole("button", { name: /Actions/ }));
    expect(
      screen.getByRole("menuitem", { name: "Rotate tool keys" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("Guidance and alerts (WEB-US-50)", () => {
  it("unmanaged agents alert", async () => {
    open({
      orch: fakeOrchestrationPort({
        get: async () => anOrchestration({ unmanagedToolAgents: ["rogue"] }),
      }),
    });
    expect(
      await screen.findByText(/Paperclip AI has agents AFS does not manage: rogue/),
    ).toBeTruthy();
  });
  it("open sign-up alert and unhealthy registration", async () => {
    open({
      orch: fakeOrchestrationPort({
        get: async () =>
          anOrchestration({
            conditions: [
              { type: "ToolReady", status: "False", reason: "OpenSignUp" },
              { type: "RegistrationHealthy", status: "False", message: "token expired" },
            ],
          }),
      }),
    });
    expect(await screen.findByText(/sign-up is open. Close it/)).toBeTruthy();
    expect(screen.getAllByText(/token expired/).length).toBeGreaterThan(0);
  });
  it("info panel guidance by mode", async () => {
    open();
    expect(await screen.findByText(/The first admin invite is written/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open orchestration logs" })).toBeTruthy();
    expect(screen.getByText(/low_trust_review/)).toBeTruthy();
  });
  it("managed mode guidance", async () => {
    open({
      orch: fakeOrchestrationPort({
        get: async () => anOrchestration({ registrationMode: "managed" }),
      }),
    });
    expect(await screen.findByText(/AFS emails the first admin invite/)).toBeTruthy();
  });
  it("a surface lowered by the limit explains why", async () => {
    open({
      orch: fakeOrchestrationPort({
        get: async () =>
          anOrchestration({
            webUi: aSurface({ exposure: "public", effective: "private", reasons: ["team_limit"] }),
          }),
      }),
    });
    expect(await screen.findByText(/Chosen: Public. In effect: Private./)).toBeTruthy();
  });
});

describe("Connected agents panel", () => {
  it("rows and link state words", async () => {
    open();
    const t = await screen.findByRole("table", { name: "Worker agents" });
    expect(await within(t).findByText("linked")).toBeTruthy();
    expect(within(t).getByText("Not connected")).toBeTruthy();
  });
  it("failed row shows lastError", async () => {
    open({
      port: fakeCollaborationPort({
        listLinks: async () => ({
          items: [aLink({ linkState: "failed", lastError: "<b>boom</b>" })],
        }),
      }),
    });
    expect(await screen.findByText("<b>boom</b>")).toBeTruthy();
  });
  it("bulk connect sends one call per agent", async () => {
    const { port } = open();
    const t = await screen.findByRole("table", { name: "Worker agents" });
    await within(t).findByText("linked");
    for (const box of within(t).getAllByRole("checkbox", { name: /^Select agt_/ }))
      await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Connect" }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(port.connect).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("2 agents updated")).toBeTruthy();
  });
  it("one failure does not stop the rest", async () => {
    const { port } = open({
      port: fakeCollaborationPort({
        disconnect: async (_t: string, a: string) => {
          if (a === "agt_1") throw new AppError({ kind: "conflict", message: "busy" });
          return aLink({ agentId: a });
        },
      }),
    });
    const t = await screen.findByRole("table", { name: "Worker agents" });
    await within(t).findByText("linked");
    for (const box of within(t).getAllByRole("checkbox", { name: /^Select agt_/ }))
      await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const d = await screen.findByRole("dialog");
    await userEvent.click(within(d).getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByText("1 of 2 did not complete")).toBeTruthy();
    expect(port.disconnect).toBeDefined();
  });
  it("disabled without collaboration:manage", async () => {
    open({ me: VIEWER, viewer: true });
    const b = await screen.findByRole("button", { name: "Connect" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Managed secrets and recent access panels", () => {
  it("keeps only the orchestration agent's afs and paperclip secrets", async () => {
    const { port } = open();
    const t = await screen.findByRole("table", { name: "Managed secrets" });
    expect(await within(t).findByText("paperclip-tool-action-signing-secret")).toBeTruthy();
    expect(within(t).queryByText("elsewhere")).toBeNull();
    expect(within(t).getByText("Managed by Paperclip")).toBeTruthy();
    expect(within(t).getByText("Managed by AFS")).toBeTruthy();
    expect(port.listManagedSecrets).toHaveBeenCalledTimes(2);
  });
  it("aggregates day rows per person and labels API keys", async () => {
    open();
    const t = await screen.findByRole("table", { name: "Recent access" });
    expect(await within(t).findByText("Ada")).toBeTruthy();
    expect(within(t).getByText("ci (API key)")).toBeTruthy();
    expect(screen.getByText(/5 sign-ins, 2 people, 1 denied requests/)).toBeTruthy();
  });
  it("links to the collaboration report for the last 7 days by person", async () => {
    open();
    const link = await screen.findByRole("link", { name: "View all in Reports" });
    expect(link.getAttribute("href")).toBe(
      "/t/team_1/reports?tab=collaboration&range=7d&groupBy=person",
    );
  });
});

describe("V4 banner (WEB-US-51)", () => {
  const admins = (n: number) =>
    fakeMembersPort({
      list: vi.fn(async () =>
        Array.from({ length: n }, (_, i) =>
          aMember({ id: `mem_${i}`, role: "team_admin", email: `admin${i}@example.test` }),
        ).concat([aMember({ id: "mem_v", role: "team_viewer", email: "viewer@example.test" })]),
      ),
    });
  it("banner names team-admins, at most three then 'and N more'", async () => {
    open({ me: VIEWER, viewer: true, members: admins(5) });
    const b = await screen.findByRole("region", { name: "Read-only access" });
    await waitFor(() => expect(b.textContent).toContain("admin0@example.test"));
    expect(b.textContent).toContain("and 2 more");
    expect(b.textContent).not.toContain("viewer@example.test");
  });
  it("banner without members omits the parenthesis", async () => {
    open({
      me: VIEWER,
      viewer: true,
      members: fakeMembersPort({
        list: vi.fn(async () => {
          throw new AppError({ kind: "unavailable", message: "down" });
        }),
      }),
    });
    const b = await screen.findByRole("region", { name: "Read-only access" });
    expect(b.textContent).toContain("Team-admins change the endpoints");
  });
  it("viewer variant disables the actions menu items", async () => {
    open({ me: VIEWER, viewer: true });
    await userEvent.click(await screen.findByRole("button", { name: /Actions/ }));
    for (const n of ["Edit endpoints", "Change tool", "Rotate tool keys"])
      expect(screen.getByRole("menuitem", { name: n }).getAttribute("aria-disabled")).toBe("true");
  });
});
