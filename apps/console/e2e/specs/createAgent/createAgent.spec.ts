import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const page_ = `/t/${T}/agents/new`;

test.describe("T3 create agent", () => {
  test("creates an agent with a binding and configuration values, then shows it @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", page_);
    await expect(page.getByLabel("Template")).toHaveValue("coder");
    await expectAxeClean(page);
    await page.getByLabel("Name").fill("security-patcher");
    await page.getByRole("button", { name: "Add secret binding" }).click();
    await page.getByLabel("Secret 1", { exact: true }).selectOption({ label: "github-bot-key" });
    await page.getByLabel("Target of secret 1", { exact: true }).fill("GITHUB_APP_KEY");
    await page.getByRole("button", { name: "Add value" }).click();
    await page.getByLabel("Name of value 1").fill("LOG_LEVEL");
    await page.getByLabel("Source of LOG_LEVEL").selectOption("namespace");
    await expect(page.getByText("from namespace")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Equivalent CLI" })).toContainText(
      "--name security-patcher",
    );
    await page.getByRole("button", { name: "Create agent" }).click();
    await expect(page.getByRole("region", { name: "Agent security-patcher" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "CreateAgent")).length).toBe(1);
    expect((await requestsWhere((r) => r.operationId === "PutAgentConfigValue")).length).toBe(1);
  });

  test("a tag-only image is refused by the API on the image field", async ({ page, signInAs }) => {
    await signInAs("team-admin", page_);
    await expect(page.getByLabel("Template")).toHaveValue("coder");
    await page.getByLabel("Name").fill("security-patcher");
    await page.getByLabel("Image").fill("registry.example.test/agents/coder:latest");
    await page.getByRole("button", { name: "Create agent" }).click();
    await expect(page.getByText(/pinned by digest/).first()).toBeVisible();
  });

  test("visual: T3", async ({ page, signInAs }) => {
    await signInAs("team-admin", page_);
    await expect(page.getByLabel("Template")).toHaveValue("coder");
    await expectVisual(page, "08-create-agent");
  });

  test("a viewer cannot create: the button is disabled and nothing is sent", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", page_);
    await expect(page.getByLabel("Template")).toHaveValue("coder");
    await expect(page.getByRole("button", { name: "Create agent" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByLabel("Name").fill("x-agent-name");
    await page.getByRole("button", { name: "Create agent" }).click({ force: true });
    expect(await mutatingCount()).toBe(0);
  });
});
