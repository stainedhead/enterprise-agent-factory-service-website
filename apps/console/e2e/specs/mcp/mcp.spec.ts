// Governed MCP servers (1.3.0, contract 1.6.0): screens 46 to 55 of the root PRD (SM1-SM5, TM1-TM5, VM1).
import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { MCP_IDS } from "../../fake-afs/fixtures/mcp.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, type Page, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const A = AGENT_IDS[0];
const ORIGINS = [
  `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? 4173}`,
  ENDPOINTS.api,
  ENDPOINTS.idp,
];
const API_KEY = "mcpkey-SENTINEL-3c9a1e7f5b2d4086";
const disabled = async (page: Page, name: string) =>
  expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-disabled", "true");

test.describe("SM1 to SM5: the service MCP catalog", () => {
  test("SM1 lists enterprise and team-managed servers and points to the review queue @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/mcp-servers");
    await expect(page.getByRole("heading", { name: "MCP servers", level: 1 })).toBeVisible();
    await expect(page.getByText("2 items need review.")).toBeVisible();
    const table = page.getByRole("table", { name: "MCP servers" });
    await expect(table.getByRole("row").filter({ hasText: "vendor-risk-api" })).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: "servicenow" })).toContainText("Draft");
    await expectAxeClean(page);
  });

  test("SM3 shows a held definition with its diff on the inventory tab", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", `/mcp-servers/${MCP_IDS.github}?tab=primitives`);
    await expect(page.getByRole("tab", { name: "Tools, resources & prompts" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("merge_pull_request").first()).toBeVisible();
    await expectAxeClean(page);
  });

  test("SM4: a security operator approves a team server with one tool blocked; a note is required", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op", "/mcp-reviews");
    await page.getByRole("link", { name: "vendor-risk-api" }).click();
    await expect(page.getByRole("heading", { name: "vendor-risk-api", level: 1 })).toBeVisible();
    await page.getByLabel("Decision for flag_vendor").selectOption("block");
    await expectAxeClean(page);
    await page.getByLabel(/Note \(required/).fill("Checked with the vendor team");
    const sent = page.waitForRequest(
      (r) =>
        r.method() === "POST" && r.url().endsWith(`/v1/mcp-servers/${MCP_IDS.vendorRisk}:approve`),
    );
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    const body = (await sent).postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      note: "Checked with the vendor team",
      primitives: [{ decision: "block" }],
    });
    await expect(page.getByRole("heading", { name: "MCP reviews", level: 1 })).toBeVisible();
    await expect(page.getByText("No server is waiting for review.")).toBeVisible();
  });

  test("a security operator cannot add or import servers", async ({ page, signInAs }) => {
    await signInAs("sec-op", "/mcp-servers");
    await disabled(page, "Add enterprise server");
    await disabled(page, "Import server.json");
    expect(await mutatingCount()).toBe(0);
  });

  test("a team admin gets no service MCP page and sends no mutation", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", "/mcp-servers");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto("/mcp-reviews");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });

  test("SM5: the MCP report keeps its view in the URL", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/reports/mcp");
    await expect(page.getByRole("tab", { name: "MCP", selected: true })).toBeVisible();
    await page.getByLabel("View").selectOption("refusals");
    await expect(page).toHaveURL(/view=refusals/);
    await expectAxeClean(page);
  });

  test("visual: SM1, SM2, SM3, SM4, SM5", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/mcp-servers");
    await expect(page.getByRole("link", { name: "github", exact: true })).toBeVisible();
    await expectVisual(page, "46-admin-mcp-catalog");
    await page.goto(`/mcp-servers/${MCP_IDS.github}`);
    await expect(page.getByRole("heading", { name: "github", level: 1 })).toBeVisible();
    await expectVisual(page, "47-admin-mcp-server-detail", { mask: ["time"] });
    await page.goto("/mcp-servers/new");
    await page.getByLabel("Slug").fill("pagerduty");
    await expectVisual(page, "48-admin-add-mcp-server");
    await page.goto(`/mcp-reviews/${MCP_IDS.vendorRisk}`);
    await expect(page.getByRole("heading", { name: "vendor-risk-api", level: 1 })).toBeVisible();
    await expectVisual(page, "49-so-mcp-review", { mask: ["time"] });
    await page.goto("/reports/mcp");
    await expect(page.getByRole("tab", { name: "MCP", selected: true })).toBeVisible();
    await expectVisual(page, "55-admin-mcp-report");
  });
});

test.describe("TM1 to TM5, VM1: a team's MCP servers", () => {
  test("TM1: a team-admin switches a server on in read-only mode", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/mcp-servers`);
    await page.getByRole("switch", { name: "eng-handbook on for the team" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("radio", { name: "Read-only" }).check();
    await expect(d.getByText(/put-team-mcp-server/)).toContainText("--mode read_only");
    await expectAxeClean(page);
    const sent = page.waitForRequest(
      (r) => r.method() === "PUT" && r.url().endsWith(`/mcp-servers/${MCP_IDS.handbook}`),
    );
    await d.getByRole("button", { name: "Switch on" }).click();
    expect((await sent).postDataJSON()).toEqual({ enabled: true, mode: "read_only" });
    await expect(
      page.getByRole("switch", { name: "eng-handbook on for the team" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("TM2: a team-admin registers a server and submits it for review", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/mcp-servers/new`);
    await page.getByLabel("Slug").fill("risk-notes");
    await page.getByLabel("Display name").fill("Risk notes");
    await page.getByLabel("Owner").fill("Marcus Chen");
    await page.getByLabel("Purpose").fill("Read the risk team's notes");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Server URL").fill("https://notes.example.test/mcp");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.getByText(/create-team-mcp-server/)).toContainText("--slug risk-notes");
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Register and submit" }).click();
    await expect(page.getByRole("heading", { name: "risk-notes", level: 1 })).toBeVisible();
    const ops = (await requestsWhere((r) => /McpServer/.test(r.operationId ?? ""))).map(
      (r) => r.operationId,
    );
    expect(ops).toEqual(
      expect.arrayContaining(["CreateTeamMcpServer", "SubmitMcpServerForReview"]),
    );
  });

  test("TM3: a team credential never leaves the input except in the request", async ({
    page,
    signInAs,
    observed,
  }) => {
    await signInAs("team-admin", `/t/${T}/mcp-servers/${MCP_IDS.vendorRisk}`);
    await page.getByRole("button", { name: "Set credential" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("API key").fill(API_KEY);
    await d.getByRole("button", { name: "Save credential" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const hits = await scanForSentinels(page, [API_KEY], observed, ORIGINS);
    expect(hits).toEqual([]);
  });

  test("TM4: an agent's server selection updates the preview and saves with If-Match", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/agents/${A}?tab=mcp`);
    const env = page.getByRole("region", { name: "MCP environment preview" });
    await expect(env).toContainText("AFS_MCP");
    await page.getByRole("radio", { name: "Selected servers" }).check();
    await page.getByRole("checkbox", { name: "Agent may use atlassian" }).uncheck();
    await expectAxeClean(page);
    const sent = page.waitForRequest(
      (r) => r.method() === "PATCH" && r.url().includes(`/agents/${A}`),
    );
    await page.getByRole("button", { name: "Save changes" }).click();
    const req = await sent;
    expect(req.headers()["if-match"]).toBeTruthy();
    const mcp = (req.postDataJSON() as { mcp: { access: string; serverIds: string[] } }).mcp;
    expect(mcp.access).toBe("selected");
    expect(mcp.serverIds).not.toContain(MCP_IDS.atlassian);
  });

  test("VM1: a viewer sees the team's servers with every changing control disabled", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", `/t/${T}/mcp-servers`);
    await expect(page.getByText("You have read-only access to this team.")).toBeVisible();
    await disabled(page, "Register team server");
    await expect(page.getByRole("switch", { name: "github on for the team" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectAxeClean(page);
    await page.goto(`/t/${T}/agents/${A}?tab=mcp`);
    await disabled(page, "Save changes");
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: TM1 to TM5", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/mcp-servers`);
    await expect(page.getByRole("table", { name: "Enterprise servers" })).toBeVisible();
    await expectVisual(page, "50-ta-team-mcp-servers");
    await page.goto(`/t/${T}/mcp-servers/new`);
    await expect(page.getByRole("heading", { name: "Register team server" })).toBeVisible();
    await expectVisual(page, "51-ta-register-team-mcp");
    await page.goto(`/t/${T}/mcp-servers/${MCP_IDS.ledger}`);
    await expect(page.getByRole("heading", { name: "ledger-schema", level: 1 })).toBeVisible();
    await expectVisual(page, "51b-ta-team-mcp-server", { mask: ["time"] });
    await page.goto(`/t/${T}/agents/${A}?tab=mcp`);
    await expect(page.getByRole("region", { name: "MCP environment preview" })).toBeVisible();
    await expectVisual(page, "52-ta-agent-mcp");
    await page.goto(`/t/${T}/mcp-usage`);
    await expect(page.getByRole("heading", { name: "MCP usage", level: 1 })).toBeVisible();
    await expectVisual(page, "53-ta-mcp-usage");
  });

  test("visual: VM1", async ({ page, signInAs }) => {
    await signInAs("viewer", `/t/${T}/mcp-servers`);
    await expect(page.getByText("You have read-only access to this team.")).toBeVisible();
    await expectVisual(page, "54-tv-team-mcp-servers");
  });
});
