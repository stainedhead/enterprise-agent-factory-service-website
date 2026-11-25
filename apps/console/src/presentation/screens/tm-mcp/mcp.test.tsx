import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  McpCatalogPort,
  McpServerRecord,
  McpUsagePort,
  TeamMcpPort,
  TeamMcpServerRecord,
} from "../../../application/ports/mcp.js";
import {
  AgentMcpUseCases,
  McpCatalogUseCases,
  McpReviewUseCases,
  McpUsageUseCases,
  TeamMcpUseCases,
} from "../../../application/usecases/mcp/McpUseCases.js";
import type { Me } from "../../../domain/me.js";
import { anAgent } from "../../testing/agents.js";
import { SEC_OP, SERVICE_ADMIN, TEAM_ADMIN, VIEWER } from "../../testing/harness.js";
import { renderScreen } from "../../testing/screen.js";
import SM1 from "../sm-mcp/index.js";
import SM4 from "../sm-mcp/reviews.js";
import { McpTab } from "../t2-agents/tabs/mcp/McpTab.js";
import { SystemSwitch } from "../t9-external-systems/SystemSwitch.js";
import TM1 from "./index.js";
import VM1 from "./viewer.js";

const server = (o: Partial<McpServerRecord> = {}): McpServerRecord => ({
  id: "mcp_1",
  slug: "atlassian",
  displayName: "Atlassian",
  scope: "enterprise",
  teamId: null,
  dataClassification: "internal",
  transport: "streamable_http",
  location: "external",
  url: "https://mcp.example/mcp",
  authKind: "static",
  credentialMode: "per_team",
  credentialState: "missing",
  reviewStatus: "approved",
  published: true,
  driftPolicy: "hold",
  createdBy: "usr_a",
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  version: 3,
  ...o,
});
const teamServer = (o: Partial<TeamMcpServerRecord> = {}): TeamMcpServerRecord => ({
  server: server(),
  enabled: false,
  mode: "full",
  state: "off",
  managed: "enterprise",
  ...o,
});

function teamPort(over: Partial<TeamMcpPort> = {}): TeamMcpPort {
  return {
    list: vi.fn(async () => [
      teamServer(),
      teamServer({
        server: server({ id: "mcp_2", slug: "github", authKind: "oauth_user" }),
        enabled: true,
        state: "on",
        credential: { scope: "team_1", state: "expired", scopes: [] },
      }),
    ]),
    get: vi.fn(),
    put: vi.fn(async () => teamServer({ enabled: true, state: "on" })),
    create: vi.fn(),
    delete: vi.fn(),
    submit: vi.fn(),
    review: vi.fn(),
    refresh: vi.fn(),
    primitives: vi.fn(async () => []),
    decidePrimitive: vi.fn(),
    putPolicy: vi.fn(),
    putCredential: vi.fn(async () => ({ scope: "team_1", state: "set", scopes: [] })),
    startOAuth: vi.fn(async () => ({
      authorizationUrl: "https://idp.example/authorize",
      expiresAt: "2026-11-25T00:10:00Z",
    })),
    disconnectOAuth: vi.fn(),
    testFederation: vi.fn(),
    effective: vi.fn(async () => ({ access: "all", mode: "search", env: [], servers: [] })),
    ...over,
  } as TeamMcpPort;
}

const usagePort: McpUsagePort = {
  run: vi.fn(async () => ({ from: "a", to: "b", view: "usage", groupBy: "server", rows: [] })),
  csv: vi.fn(async () => ""),
};

function catalogPort(over: Partial<McpCatalogPort> = {}): McpCatalogPort {
  return {
    list: vi.fn(async () => [
      server(),
      server({
        id: "mcp_9",
        slug: "vendor-risk-api",
        scope: "team",
        teamId: "team_1",
        reviewStatus: "pending_review",
        published: false,
        riskTier: "elevated",
        approver: "security",
      }),
    ]),
    get: vi.fn(async () =>
      server({
        id: "mcp_9",
        slug: "vendor-risk-api",
        scope: "team",
        teamId: "team_1",
        reviewStatus: "pending_review",
        riskTier: "elevated",
        approver: "security",
        checks: [{ name: "tls", outcome: "pass", checkedAt: "x" }],
      }),
    ),
    primitives: vi.fn(async () => [
      {
        id: "mcpp_1",
        serverId: "mcp_9",
        name: "web_lookup",
        kind: "tool",
        status: "approved",
        digest: "d",
        approvedDigest: "d",
      },
    ]),
    reviews: vi.fn(async () => [
      {
        kind: "server",
        serverId: "mcp_9",
        slug: "vendor-risk-api",
        teamId: "team_1",
        approver: "security",
        since: "2026-11-24T00:00:00Z",
      },
    ]),
    review: vi.fn(async () => server()),
    ...over,
  } as McpCatalogPort;
}

function team(me: Me, port = teamPort(), viewer = false) {
  renderScreen(viewer ? <VM1 /> : <TM1 />, {
    me,
    services: {
      teamMcp: new TeamMcpUseCases(port),
      mcpUsage: new McpUsageUseCases(usagePort),
    },
    path: "/t/team_1/mcp-servers",
    route: "/t/:teamId/mcp-servers",
  });
  return port;
}

const isDisabled = (el: HTMLElement) =>
  (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true";

describe("TM1 and VM1 team MCP servers (MCP-WEB-3, screens 50 and 54)", () => {
  it("switches an enterprise server on in the chosen mode after confirming", async () => {
    const port = team(TEAM_ADMIN);
    const sw = await screen.findByRole("switch", { name: "atlassian on for the team" });
    await userEvent.click(sw);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByLabelText("Read-only"));
    expect(within(dialog).getByText(/put-team-mcp-server/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "Switch on" }));
    await waitFor(() =>
      expect(port.put).toHaveBeenCalledWith("team_1", "mcp_1", true, "read_only"),
    );
  });

  it("warns of a revoked OAuth connection and opens the sign-in in a new window", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const port = team(TEAM_ADMIN);
    const alert = await screen.findByText("github needs reconnecting.");
    const box = alert.closest("[role=alert]") as HTMLElement;
    await userEvent.click(within(box).getByRole("button", { name: "Reconnect" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://idp.example/authorize",
        "_blank",
        "noopener,noreferrer",
      ),
    );
    expect(port.startOAuth).toHaveBeenCalledWith("team_1", "mcp_2");
    open.mockRestore();
  });

  it("denied: a viewer sees the read-only banner and every control disabled with the role", async () => {
    const port = team(VIEWER, teamPort(), true);
    expect(await screen.findByText("You have read-only access to this team.")).toBeTruthy();
    const sw = await screen.findByRole("switch", { name: "atlassian on for the team" });
    expect(isDisabled(sw)).toBe(true);
    await userEvent.click(sw);
    expect(screen.queryByRole("dialog")).toBeNull();
    const register = screen.getByRole("button", { name: /Register team server/ });
    expect(isDisabled(register)).toBe(true);
    expect(screen.getAllByText("Requires team-admin").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Reconnect" })).toBeNull();
    expect(port.put).not.toHaveBeenCalled();
  });

  it("sets a static credential through the masked input only", async () => {
    const port = team(
      TEAM_ADMIN,
      teamPort({
        list: vi.fn(async () => [
          teamServer({
            enabled: true,
            state: "on",
            credential: { scope: "team_1", state: "missing", scopes: [] },
          }),
        ]),
      }),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Set credential" }));
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("API key") as HTMLInputElement;
    expect(input.type).toBe("password");
    await userEvent.type(input, "tok-123");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save credential" }));
    await waitFor(() =>
      expect(port.putCredential).toHaveBeenCalledWith("team_1", "mcp_1", { value: "tok-123" }),
    );
    expect(document.body.textContent).not.toContain("tok-123");
  });
});

describe("SM1 catalog and SM4 reviews (MCP-WEB-1, -4, screens 46 and 49)", () => {
  const services = (port = catalogPort()) => ({
    mcpCatalog: new McpCatalogUseCases(port),
    mcpReviews: new McpReviewUseCases(port),
    mcpUsage: new McpUsageUseCases(usagePort),
  });

  it("shows enterprise and team servers with the review alert to a service admin", async () => {
    renderScreen(<SM1 />, { me: SERVICE_ADMIN, services: services(), path: "/mcp-servers" });
    expect(await screen.findByText("vendor-risk-api")).toBeTruthy();
    expect(await screen.findByText("1 items need review.")).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: "Add enterprise server" }))).toBe(false);
  });

  it("denied: a security operator reads the catalog but cannot add or import", async () => {
    renderScreen(<SM1 />, { me: SEC_OP, services: services(), path: "/mcp-servers" });
    expect(await screen.findByText("atlassian")).toBeTruthy();
    expect(isDisabled(screen.getByRole("button", { name: /Add enterprise server/ }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: /Import server.json/ }))).toBe(true);
  });

  it("denied: a team-admin gets not-found for the catalog and the review queue", () => {
    renderScreen(<SM1 />, { me: TEAM_ADMIN, services: services(), path: "/mcp-servers" });
    expect(screen.queryByText("MCP servers")).toBeNull();
    renderScreen(<SM4 />, { me: TEAM_ADMIN, services: services(), path: "/mcp-reviews" });
    expect(screen.queryByText("MCP reviews")).toBeNull();
  });

  it("a security operator approves with a note and a per-tool block", async () => {
    const port = catalogPort();
    renderScreen(<SM4 />, {
      me: SEC_OP,
      services: services(port),
      path: "/mcp-reviews/mcp_9",
      route: "/mcp-reviews/:mcpServerId",
    });
    const select = await screen.findByLabelText("Decision for web_lookup");
    await userEvent.selectOptions(select, "block");
    await userEvent.type(screen.getByLabelText(/Note \(required/), "web_lookup blocked");
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(port.review).toHaveBeenCalledWith("mcp_9", "approve", {
        note: "web_lookup blocked",
        primitives: [{ primitiveId: "mcpp_1", decision: "block" }],
      }),
    );
  });

  it("refuses a decision without a note (nothing is sent)", async () => {
    const port = catalogPort();
    renderScreen(<SM4 />, {
      me: SEC_OP,
      services: services(port),
      path: "/mcp-reviews/mcp_9",
      route: "/mcp-reviews/:mcpServerId",
    });
    await userEvent.click(await screen.findByRole("button", { name: "Reject" }));
    expect(await screen.findByText("Enter a decision note")).toBeTruthy();
    expect(port.review).not.toHaveBeenCalled();
  });
});

describe("TM4 agent MCP tab (MCP-WEB-3, screen 52)", () => {
  const on = teamPort({
    list: vi.fn(async () => [
      teamServer({ enabled: true, state: "on" }),
      teamServer({ server: server({ id: "mcp_2", slug: "github" }), enabled: true, state: "on" }),
    ]),
  });

  it("saves the selection, mode and blocks through UpdateAgent with the agent's version", async () => {
    const agents = { update: vi.fn(async () => anAgent()) };
    renderScreen(<McpTab teamId="team_1" agent={anAgent({ version: 7 })} />, {
      me: TEAM_ADMIN,
      services: {
        teamMcp: new TeamMcpUseCases(on),
        agentMcp: new AgentMcpUseCases(agents as never),
      },
    });
    expect(await screen.findByText(/AFS_MCP_SERVERS=atlassian,github/)).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Selected servers"));
    await userEvent.click(screen.getByLabelText("Agent may use atlassian"));
    await userEvent.click(screen.getByLabelText(/Full listing/));
    await userEvent.selectOptions(screen.getByLabelText("Block a tool on"), "mcp_2");
    await userEvent.type(screen.getByLabelText("Tool name"), "merge_pull_request");
    await userEvent.click(screen.getByRole("button", { name: "Add block" }));
    expect(screen.getByText(/AFS_MCP_SERVERS=github/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(agents.update).toHaveBeenCalledWith(
        "team_1",
        { id: "agt_1", version: 7 },
        {
          mcp: {
            access: "selected",
            serverIds: ["mcp_2"],
            mode: "full",
            blocks: [{ serverId: "mcp_2", name: "merge_pull_request", effect: "block" }],
          },
        },
      ),
    );
  });

  it("denied: a viewer sees the settings but cannot change or save them", async () => {
    const agents = { update: vi.fn() };
    renderScreen(<McpTab teamId="team_1" agent={anAgent()} />, {
      me: VIEWER,
      services: {
        teamMcp: new TeamMcpUseCases(on),
        agentMcp: new AgentMcpUseCases(agents as never),
      },
    });
    const sel = await screen.findByLabelText("Selected servers");
    await userEvent.click(sel);
    expect((sel as HTMLInputElement).checked).toBe(false);
    expect(isDisabled(screen.getByRole("button", { name: /Save changes/ }))).toBe(true);
    expect(agents.update).not.toHaveBeenCalled();
  });
});

describe("governedBy on external systems (MCP-WEB-5)", () => {
  it("locks the switch and links to the governing MCP server", async () => {
    const onChange = vi.fn();
    renderScreen(
      <SystemSwitch
        name="Jira"
        state={{ on: true, level: undefined, locked: false }}
        reason={undefined}
        onChange={onChange}
        governedBy="mcp_1"
        governedHref="/t/team_1/mcp-servers/mcp_1"
      />,
      { me: TEAM_ADMIN, services: {} },
    );
    const sw = screen.getByRole("switch", { name: "Jira" });
    expect(sw.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(sw);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "mcp_1" }).getAttribute("href")).toBe(
      "/t/team_1/mcp-servers/mcp_1",
    );
  });
});
