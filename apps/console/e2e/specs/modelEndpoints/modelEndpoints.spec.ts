// Model endpoint gateway (1.2.0): TC-UI-01 to TC-UI-11 of the root model-endpoint-gateway PRD.
import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { ENDPOINT_IDS } from "../../fake-afs/fixtures/modelEndpoints.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, type Page, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const ORIGINS = [
  `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? 4173}`,
  ENDPOINTS.api,
  ENDPOINTS.idp,
];
const CREDENTIAL = "sk-SENTINEL-7d1f0a2c9b8e4f63";
const disabled = async (page: Page, name: string) =>
  expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-disabled", "true");

test.describe("SG1 to SG6: service model endpoints", () => {
  test("lists service and team-declared endpoints with badges and states @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/model-endpoints");
    await expect(page.getByRole("heading", { name: "Model endpoints", level: 1 })).toBeVisible();
    const table = page.getByRole("table", { name: "Service endpoints" });
    await expect(table.getByRole("row").filter({ hasText: "azure-openai" })).toContainText(
      "Off by provider policy",
    );
    await expect(page.getByText("ml-platform is degraded")).toBeVisible();
    await expect(
      page.getByRole("table", { name: "Team-declared endpoints" }).getByText("coder-vllm"),
    ).toBeVisible();
    await expectAxeClean(page);
  });

  test("TC-UI-01: the wizard's review and CLI preview match the request sent", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/model-endpoints/new");
    await page.getByLabel("Route name").fill("together-ai");
    await page.getByLabel("Display name").fill("Together AI");
    await page.getByLabel("Base URL").fill("https://api.together.example.test/v1");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Add model" }).click();
    await page.getByLabel("Model name").fill("open-large");
    await page.getByLabel("Input $/MTok").fill("0.90");
    await page.getByLabel("Output $/MTok").fill("0.90");
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.getByText("Together AI", { exact: true }).first()).toBeVisible();
    const cli = page.getByText(/afs model-endpoints create-model-endpoint/);
    await expect(cli).toContainText("--slug together-ai");
    await expect(cli).toContainText("--base-url https://api.together.example.test/v1");
    await expectAxeClean(page);
    const sent = page.waitForRequest(
      (r) => r.method() === "POST" && r.url().endsWith("/v1/admin/model-endpoints"),
    );
    await page.getByRole("button", { name: "Create endpoint" }).click();
    const body = (await sent).postDataJSON() as Record<string, unknown>;
    expect(body).toMatchObject({
      slug: "together-ai",
      displayName: "Together AI",
      baseUrl: "https://api.together.example.test/v1",
      pricingMode: "per_token",
      models: [{ modelName: "open-large", maxOutputTokens: 4096 }],
    });
    await expect(page.getByRole("heading", { name: "together-ai", level: 1 })).toBeVisible();
    const prices = await requestsWhere((r) => r.operationId === "CreateEndpointModelPrice");
    expect(prices.length).toBe(1);
  });

  test("approves an endpoint price proposal", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/model-endpoints/proposals");
    await expect(page.getByRole("cell", { name: "2.00 → 1.75" })).toBeVisible();
    await page.getByRole("button", { name: "Approve openai-prod gpt-large" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("No price changes are waiting.")).toBeVisible();
  });

  test("TC-UI-06: a credential value never leaves the input except in the request", async ({
    page,
    signInAs,
    observed,
  }) => {
    await signInAs("svc-admin", `/model-endpoints/${ENDPOINT_IDS.openai}`);
    await page.getByRole("tab", { name: "Teams & credentials" }).click();
    await page.getByRole("button", { name: "Rotate credential for payments" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByText(/put-model-endpoint-credential/)).toContainText("file://");
    await d.getByLabel("Credential value").fill(CREDENTIAL);
    await d.getByRole("button", { name: "Rotate" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const hits = await scanForSentinels(page, [CREDENTIAL], observed, ORIGINS);
    // the only place the value may appear is the body of the request to the API
    expect(hits).toEqual([]);
  });

  test("TC-UI-11: Bedrock needs a fallback, every team and a reason before Turn off", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/model-endpoints/providers");
    await page.getByRole("switch", { name: "Amazon Bedrock allowed" }).click();
    const d = page.getByRole("dialog");
    await disabled(page, "Turn off");
    await expect(
      d.getByRole("status").filter({ hasText: "Choose a fallback default model" }),
    ).toBeVisible();
    await d.getByLabel("Fallback default model").selectOption("openai-prod/gpt-large");
    await expect(d.getByText("Agents moving to the fallback")).toBeVisible();
    await expect(
      d
        .getByRole("status")
        .filter({ hasText: "The fallback route must be selected for every team" }),
    ).toBeVisible();
    await d.getByRole("switch", { name: "Select the fallback route for every team" }).click();
    await d.getByLabel("Reason").fill("Enterprise policy");
    await expectAxeClean(page);
    await expectVisual(page, "68a-admin-provider-policy-confirm");
    expect(
      await requestsWhere(
        (r) => r.operationId === "UpdateInferenceProvider" && !r.query.includes("dryRun"),
      ),
    ).toHaveLength(0);
    await d.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(
      await requestsWhere(
        (r) => r.operationId === "UpdateInferenceProvider" && !r.query.includes("dryRun"),
      ),
    ).toHaveLength(1);
  });

  test("TC-UI-11: a provider turned off shows as off to the team-admin, with no policy control", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/model-endpoints/providers");
    await page.getByRole("switch", { name: "OpenAI allowed" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByText("Routes refused")).toBeVisible();
    await disabled(page, "Turn off");
    await d.getByLabel("Reason").fill("Not approved");
    await d.getByRole("button", { name: "Turn off" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await signInAs("team-admin", `/t/${T}/model-endpoints`);
    await expect(
      page.getByRole("table", { name: "Service endpoints of the team" }).getByRole("row").filter({
        hasText: "openai-prod",
      }),
    ).toContainText("Off by provider policy");
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("SG5: a service admin allows a team its own endpoints, then the team-admin cannot (TC-UI-05)", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", `/teams/${T}/admin?tab=model-endpoints`);
    await page
      .getByRole("switch", { name: "The team may declare its own model endpoints" })
      .click();
    await page.getByRole("button", { name: "Save gateway settings" }).click();
    await expect(page.getByRole("button", { name: "Save gateway settings" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await signInAs("team-admin", `/t/${T}/model-endpoints`);
    const create = page.getByRole("button", { name: "Create endpoint" });
    await expect(create).toHaveAttribute("aria-disabled", "true");
    await create.focus();
    await expect(page.getByRole("tooltip")).toHaveText("Needs permission from a service admin");
  });

  test("a team admin gets no service page and sends no mutation", async ({ page, signInAs }) => {
    await signInAs("team-admin", "/model-endpoints");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: SG1, SG2, SG3, SG4, SG5, SG6", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/model-endpoints");
    await expect(page.getByText("coder-vllm")).toBeVisible();
    await expectVisual(page, "56-admin-model-endpoints");
    await page.goto("/model-endpoints/new");
    await page.getByLabel("Route name").fill("together-ai");
    await expectVisual(page, "57-admin-create-model-endpoint");
    await page.goto(`/model-endpoints/${ENDPOINT_IDS.openai}`);
    await expect(page.getByRole("table", { name: /Models of/ })).toBeVisible();
    await expectVisual(page, "58-admin-endpoint-detail");
    await page.goto("/reports/inference");
    await expect(page.getByRole("cell", { name: "ml-platform" })).toBeVisible();
    await expectVisual(page, "59-admin-inference-report");
    await page.goto(`/teams/${T}/admin?tab=model-endpoints`);
    await expect(page.getByRole("button", { name: "Save gateway settings" })).toBeVisible();
    await expectVisual(page, "60-admin-team-routes");
    await page.goto("/model-endpoints/providers");
    await expect(page.getByRole("table", { name: "Providers" })).toBeVisible();
    await expectVisual(page, "68-admin-provider-policy");
  });
});

test.describe("TG1 to TG5, VG1, VG2: a team's routes", () => {
  test("TC-UI-10: a team-admin opts in to an endpoint; extra-terms ones need a service admin", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/model-endpoints`);
    await expect(page.getByText("ml-platform is degraded")).toBeVisible();
    await disabled(page, "Add azure-openai to team");
    await page.getByRole("button", { name: "Add azure-openai to team" }).focus();
    await expect(page.getByRole("tooltip")).toHaveText("Needs a service admin");
    await page.getByRole("button", { name: "Add nous-portal to team" }).click();
    await expect(
      page.getByRole("table", { name: "Service endpoints of the team" }).getByText("nous-portal"),
    ).toBeVisible();
    const puts = await requestsWhere((r) => r.operationId === "PutTeamModelEndpoints");
    expect(puts.length).toBe(1);
    await expectAxeClean(page);
  });

  test("TC-UI-02: a refused create shows the error and saves nothing", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/model-endpoints/new`);
    await page.getByLabel("Route name").fill("coder-two");
    await page.getByLabel("Display name").fill("Coder two");
    await page.getByLabel("Base URL").fill("http://<service>:8000/v1");
    await page.getByLabel("Owner").fill("Marcus Chen");
    await page.getByLabel("Purpose").fill("Experiments");
    await expect(page.getByText(/create-team-model-endpoint/)).toContainText("--slug coder-two");
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Create endpoint" }).click();
    await expect(page.getByText("The endpoint was not created")).toBeVisible();
    await page.goto(`/t/${T}/model-endpoints`);
    await expect(page.getByRole("table", { name: "Team endpoints" }).getByRole("row")).toHaveCount(
      2,
    );
  });

  test("TC-UI-03: route changes update the env preview and save with If-Match", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/agents/${AGENT_IDS[0]}?tab=models`);
    const env = page.getByRole("region", { name: "Environment preview" });
    await expect(env).toContainText("AFS_LLM_ROUTES=bedrock,coder-vllm,ml-platform");
    await page.getByRole("radio", { name: "Selected routes" }).check();
    await page.getByRole("checkbox", { name: "Agent may call ml-platform" }).uncheck();
    await page.getByLabel("Default route").selectOption("openai-prod");
    await page.getByLabel("Default model on that route").selectOption("gpt-small");
    await expect(env).toContainText("AFS_LLM_DEFAULT_ROUTE=openai-prod");
    await expect(env).toContainText("AFS_LLM_DEFAULT_MODEL=gpt-small");
    await expect(env).not.toContainText("ML_PLATFORM");
    await expect(env).toContainText("OPENAI_API_KEY=afs-gateway");
    await expectAxeClean(page);
    const sent = page.waitForRequest(
      (r) => r.method() === "PATCH" && r.url().includes(`/agents/${AGENT_IDS[0]}`),
    );
    await page.getByRole("button", { name: "Save routes" }).click();
    const req = await sent;
    expect(req.headers()["if-match"]).toBeTruthy();
    expect(req.postDataJSON()).toMatchObject({
      models: { routeAccess: "selected", defaultRoute: "openai-prod" },
    });
  });

  test("TC-UI-04: a viewer sees the routes with every changing control disabled", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", `/t/${T}/model-endpoints`);
    await expect(page.getByText("Read-only access")).toBeVisible();
    await disabled(page, "Create endpoint");
    await disabled(page, "Remove ml-platform from team");
    await disabled(page, "Add nous-portal to team");
    await expectAxeClean(page);
    await page.goto(`/t/${T}/agents/${AGENT_IDS[0]}?tab=models`);
    await disabled(page, "Save routes");
    expect(await mutatingCount()).toBe(0);
  });

  test("the team inference report and budget by route", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/reports/inference`);
    await expect(page.getByRole("tab", { name: "Inference", selected: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "coder-vllm" })).toBeVisible();
    await expectAxeClean(page);
    await page.goto(`/t/${T}/budget`);
    const byRoute = page.getByRole("table", { name: "Spend by route this month" });
    await expect(byRoute.getByRole("row").filter({ hasText: "coder-vllm" })).toContainText(
      "Reported only",
    );
  });

  test("visual: TG1 to TG5, VG1, VG2", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/model-endpoints`);
    await expect(page.getByText("coder-vllm")).toBeVisible();
    await expectVisual(page, "61-ta-model-endpoints");
    await page.goto(`/t/${T}/model-endpoints/new`);
    await expectVisual(page, "62-ta-create-team-endpoint");
    await page.goto(`/t/${T}/agents/${AGENT_IDS[0]}?tab=models`);
    await expect(page.getByRole("region", { name: "Environment preview" })).toBeVisible();
    await expectVisual(page, "63-ta-agent-models-routes");
    await page.goto(`/t/${T}/reports/inference`);
    await expect(page.getByRole("cell", { name: "coder-vllm" })).toBeVisible();
    await expectVisual(page, "64-ta-team-inference-report");
    await page.goto(`/t/${T}/budget`);
    await expect(page.getByRole("table", { name: "Spend by route this month" })).toBeVisible();
    await expectVisual(page, "65-ta-budget-routes", { mask: ["time"] });
    await signInAs("viewer", `/t/${T}/model-endpoints`);
    await expect(page.getByText("Read-only access")).toBeVisible();
    await expectVisual(page, "66-tv-model-endpoints");
    await page.goto(`/t/${T}/agents/${AGENT_IDS[0]}?tab=models`);
    await expect(page.getByRole("region", { name: "Environment preview" })).toBeVisible();
    await expectVisual(page, "67-tv-agent-models-routes");
  });
});
