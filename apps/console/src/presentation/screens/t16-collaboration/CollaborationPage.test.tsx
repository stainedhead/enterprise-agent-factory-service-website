import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../../application/errors.js";
import type { Me } from "../../../domain/me.js";
import { agentsServices, anAgent, fakeAgentsPort } from "../../testing/agents.js";
import {
  aCollaboration,
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
import { renderScreen } from "../../testing/screen.js";
import { aTeam, fakeTeamsPort, teamsServices } from "../../testing/teams.js";
import T16 from "./index.js";
import V3 from "./viewer.js";

function open(
  o: {
    me?: Me;
    port?: FakeCollaborationPort;
    suspended?: boolean;
    viewer?: boolean;
    members?: ReturnType<typeof fakeMembersPort>;
  } = {},
) {
  const port = o.port ?? fakeCollaborationPort();
  const teams = fakeTeamsPort();
  teams.get.mockResolvedValue(aTeam(o.suspended ? { state: "suspended" } : {}));
  const agents = fakeAgentsPort({
    list: async () => [anAgent(), anAgent({ id: "agt_2", name: "incident-scribe" })],
  });
  renderScreen(o.viewer ? <V3 /> : <T16 />, {
    me: o.me ?? TEAM_ADMIN,
    services: {
      ...collaborationServices(port),
      ...agentsServices(agents),
      ...teamsServices(teams),
      ...(o.members ? membersServices(o.members, fakeApiKeysPort()) : {}),
    },
    path: "/t/team_1/collaboration",
    route: "/t/:teamId/collaboration",
  });
  return port;
}

const sw = (name: string) => screen.findByRole("switch", { name });

describe("T16 collaboration page", () => {
  it("status panel", async () => {
    open();
    expect(await screen.findByText("alpha.collab.example.test")).toBeTruthy();
    expect(screen.getByText("Manual")).toBeTruthy();
    expect(screen.getByText("gen 4 / 4", { exact: false })).toBeTruthy();
    const status = screen.getByRole("region", { name: "Status" });
    for (const t of [
      "EndpointReady",
      "PaperclipReady",
      "RegistrationHealthy",
      "UnmanagedPaperclipAgents",
    ])
      expect(within(status).getByText(t)).toBeTruthy();
    expect(within(status).getByText("Collaboration")).toBeTruthy();
  });
  it("says a change is not applied yet and lists unmanaged agents", async () => {
    open({
      port: fakeCollaborationPort({
        get: async () =>
          aCollaboration({ observedGeneration: 3, unmanagedPaperclipAgents: ["pc-rogue"] }),
      }),
    });
    expect(await screen.findByText("Change not applied yet")).toBeTruthy();
    expect(screen.getByText(/pc-rogue/)).toBeTruthy();
  });
  it("switch confirm on enable", async () => {
    const port = open();
    await userEvent.click(await sw("REST API enabled"));
    const d = await screen.findByRole("dialog");
    expect(within(d).getByText(/reachable from\s+the internet/)).toBeTruthy();
    expect(port.put).not.toHaveBeenCalled();
    await userEvent.click(within(d).getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(port.put).toHaveBeenCalled());
    expect(port.put.mock.calls[0]?.[1]).toEqual({ version: 3 });
    expect(port.put.mock.calls[0]?.[2]).toEqual({ webUiEnabled: true, restApiEnabled: true });
    expect(await screen.findByText(/Takes effect within a minute/)).toBeTruthy();
  });
  it("turning a surface off needs no confirmation", async () => {
    const port = open();
    await userEvent.click(await sw("Web UI enabled"));
    await waitFor(() => expect(port.put).toHaveBeenCalled());
    expect(port.put.mock.calls[0]?.[2]).toEqual({ webUiEnabled: false, restApiEnabled: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("blocked switch tooltips", async () => {
    open({
      port: fakeCollaborationPort({
        get: async () =>
          aCollaboration({
            webUiEnabled: false,
            effective: { webUi: false, restApi: false, reasons: ["service_endpoints_off"] },
          }),
      }),
    });
    const s = await sw("Web UI enabled");
    expect(s.getAttribute("aria-disabled")).toBe("true");
    expect(
      screen.getAllByText("Public collaboration is off for the service").length,
    ).toBeGreaterThan(0);
  });
  it("on but not effective can be turned off", async () => {
    const port = open({
      port: fakeCollaborationPort({
        get: async () =>
          aCollaboration({
            effective: { webUi: false, restApi: false, reasons: ["team_not_allowed"] },
          }),
      }),
    });
    const s = await sw("Web UI enabled");
    expect(s.getAttribute("aria-disabled")).toBeNull();
    await userEvent.click(s);
    await waitFor(() => expect(port.put).toHaveBeenCalled());
  });
  it("412 keeps the choice and offers reload", async () => {
    const port = open({
      port: fakeCollaborationPort({
        put: async () => {
          throw new AppError({ kind: "stale", message: "stale", requestId: "req_1" });
        },
      }),
    });
    await userEvent.click(await sw("Web UI enabled"));
    expect(await screen.findByText(/changed since you opened it/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(port.get).toHaveBeenCalledTimes(1);
  });
  it("shows the reason text of a validation error", async () => {
    open({
      port: fakeCollaborationPort({
        put: async () => {
          throw new AppError({
            kind: "validation",
            message: "Invalid",
            fields: { webUiEnabled: "team_not_allowed" },
          });
        },
      }),
    });
    await userEvent.click(await sw("Web UI enabled"));
    expect(await screen.findByText("Not allowed for this team by the service")).toBeTruthy();
  });
  it("team suspended disables controls", async () => {
    open({ suspended: true });
    const s = await sw("Web UI enabled");
    await waitFor(() => expect(s.getAttribute("aria-disabled")).toBe("true"));
    const row = await screen.findByRole("link", { name: "Open Paperclip" });
    expect(row.getAttribute("aria-disabled")).toBe("true");
  });
  it("cli panel", async () => {
    open();
    expect(await screen.findByText(/Equivalent command for team/)).toBeTruthy();
    expect(screen.getAllByText(/afs collaboration put-collaboration/).length).toBeGreaterThan(0);
  });
  it("empty state on collaboration_agent_missing sends no other request", async () => {
    const port = open({
      port: fakeCollaborationPort({
        get: async () => {
          throw new AppError({
            kind: "not-found",
            message: "none",
            reason: "collaboration_agent_missing",
          });
        },
      }),
    });
    expect(await screen.findByText("This team has no collaboration agent")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create collaboration agent" })).toBeTruthy();
    expect(port.listLinks).not.toHaveBeenCalled();
    expect(port.recentAccess).not.toHaveBeenCalled();
  });
  it("a failing load shows its own error", async () => {
    open({
      port: fakeCollaborationPort({
        get: async () => {
          throw new AppError({ kind: "unavailable", message: "down", requestId: "req_5" });
        },
      }),
    });
    expect(await screen.findByText("Collaboration could not be loaded")).toBeTruthy();
  });
  it("a viewer sees the read-only page and cannot change a switch", async () => {
    const port = open({ me: VIEWER, viewer: true });
    const s = await sw("Web UI enabled");
    expect(s.getAttribute("aria-disabled")).toBe("true");
    expect(await screen.findByRole("heading", { name: /Read-only/ })).toBeTruthy();
    await userEvent.click(s);
    expect(port.put).not.toHaveBeenCalled();
  });
  it("Open Paperclip is a link when everything is ready", async () => {
    open();
    const a = await screen.findByRole("link", { name: "Open Paperclip" });
    expect(a.getAttribute("href")).toBe("https://alpha.collab.example.test/");
    expect(a.getAttribute("target")).toBe("_blank");
  });
  it("Open Paperclip is disabled with its reason while the agent is not Ready", async () => {
    open({
      port: fakeCollaborationPort({ get: async () => aCollaboration({ phase: "Reconciling" }) }),
    });
    const l = await screen.findByRole("link", { name: "Open Paperclip" });
    expect(l.getAttribute("aria-disabled")).toBe("true");
  });
  it("a service admin keeps the page usable", async () => {
    open({ me: SERVICE_ADMIN });
    expect(await screen.findByRole("region", { name: "Status" })).toBeTruthy();
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
    const port = open();
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
    const port = open({
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
  it("keeps only the collaboration agent's afs and paperclip secrets", async () => {
    const port = open();
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
});

describe("V3 banner (WEB-US-51)", () => {
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
    for (const n of ["Edit endpoints", "Rotate Paperclip keys", "Delete collaboration agent"])
      expect(screen.getByRole("menuitem", { name: n }).getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Guidance, alerts and dialogs (WEB-US-50)", () => {
  it("unmanaged agents alert", async () => {
    open({
      port: fakeCollaborationPort({
        get: async () => aCollaboration({ unmanagedPaperclipAgents: ["rogue"] }),
      }),
    });
    expect(await screen.findByText(/Paperclip has agents AFS does not manage: rogue/)).toBeTruthy();
  });
  it("open sign-up alert and unhealthy registration", async () => {
    open({
      port: fakeCollaborationPort({
        get: async () =>
          aCollaboration({
            conditions: [
              { type: "PaperclipReady", status: "False", reason: "OpenSignUp" },
              { type: "RegistrationHealthy", status: "False", message: "token expired" },
            ],
          }),
      }),
    });
    expect(await screen.findByText(/Paperclip sign-up is open. Close it/)).toBeTruthy();
    expect(screen.getAllByText(/token expired/).length).toBeGreaterThan(0);
  });
  it("info panel guidance by mode", async () => {
    open();
    expect(await screen.findByText(/The first Paperclip admin invite is written/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open agent logs" })).toBeTruthy();
    expect(screen.getByText(/low_trust_review/)).toBeTruthy();
  });
  it("managed mode guidance", async () => {
    open({
      port: fakeCollaborationPort({
        get: async () => aCollaboration({ registrationMode: "managed" }),
      }),
    });
    expect(await screen.findByText(/AFS emails the first admin invite/)).toBeTruthy();
  });
  const choose = async (name: string) => {
    await userEvent.click(await screen.findByRole("button", { name: /Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name }));
    return await screen.findByRole("dialog");
  };
  it("managed disabled until Ready", async () => {
    open({
      port: fakeCollaborationPort({ get: async () => aCollaboration({ phase: "Reconciling" }) }),
    });
    const d = within(await choose("Edit endpoints"));
    expect(d.getByRole("radio", { name: "Managed" }).getAttribute("aria-disabled")).toBe("true");
    expect(d.getByText("The collaboration agent must be Ready")).toBeTruthy();
  });
  it("edit endpoints sends the mode only when changed, after a review", async () => {
    const port = open();
    const d = within(await choose("Edit endpoints"));
    await userEvent.click(d.getByRole("radio", { name: "Managed" }));
    await userEvent.click(d.getByRole("button", { name: "Review" }));
    expect(d.getAllByText(/--registration-mode managed/).length).toBeGreaterThan(0);
    await userEvent.click(d.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(port.put).toHaveBeenCalled());
    expect(port.put.mock.calls[0]?.[2]).toEqual({
      webUiEnabled: true,
      restApiEnabled: false,
      registrationMode: "managed",
    });
  });
  it("rotate keys: master key disabled, acknowledgement required, sends the chosen names", async () => {
    const port = open();
    const d = within(await choose("Rotate Paperclip keys"));
    expect(
      (d.getByRole("checkbox", { name: "paperclip-secrets-master-key" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(d.getByText(/Cannot be rotated/)).toBeTruthy();
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
    expect(document.body.textContent).not.toMatch(/versionId|v2$/);
  });
  it("delete collaboration agent opens the agent", async () => {
    open();
    await userEvent.click(await screen.findByRole("button", { name: /Actions/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete collaboration agent" }));
    expect(await screen.findByText("elsewhere")).toBeTruthy();
  });
});
