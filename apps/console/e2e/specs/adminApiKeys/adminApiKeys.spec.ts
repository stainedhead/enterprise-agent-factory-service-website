import { SENTINEL_SECRET } from "../../fake-afs/fixtures/members.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const keys = "/settings/service-api-keys";
const operators = "/settings/security-operators";

test.describe("S10 service API keys", () => {
  test("creates a key, shows the secret once and leaves it nowhere afterwards @smoke", async ({
    page,
    signInAs,
    observed,
  }) => {
    await signInAs("svc-admin", keys);
    await expect(page.getByText("work-order-pipeline")).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Create service API key" }).click();
    await page.getByLabel("Name").fill("deploy");
    await expect(page.getByRole("dialog").locator("code")).toContainText(
      "--role security_operator",
    );
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByLabel("Service API key", { exact: true })).toHaveText(SENTINEL_SECRET);
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("deploy")).toBeVisible();
    const hits = await scanForSentinels(page, [SENTINEL_SECRET], observed, [
      "http://127.0.0.1:4173",
      ENDPOINTS.api,
      ENDPOINTS.idp,
    ]);
    expect(hits).toEqual([]);
  });

  test("a replayed create says the key cannot be shown again; a key can be deleted", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", keys);
    await page.getByRole("button", { name: "Create service API key" }).click();
    await page.getByLabel("Name").fill("replay-me");
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByText(/cannot be shown again/)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Delete key replay-me" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("replay-me")).toHaveCount(0);
    expect((await requestsWhere((r) => r.operationId === "DeleteServiceApiKey")).length).toBe(1);
  });

  test("a days value over 90 is refused before any request", async ({ page, signInAs }) => {
    await signInAs("svc-admin", keys);
    await page.getByRole("button", { name: "Create service API key" }).click();
    await page.getByLabel("Name").fill("long");
    await page.getByLabel("Expires in (days)").fill("120");
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByText(/from 1 to 90/)).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "CreateServiceApiKey")).length).toBe(0);
  });

  test("a team admin does not get the tab and never reads the keys", async ({ page, signInAs }) => {
    await signInAs("team-admin", keys);
    await expect(page.getByRole("button", { name: "Create service API key" })).toHaveCount(0);
    expect((await requestsWhere((r) => r.operationId === "ListServiceApiKeys")).length).toBe(0);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: S10 service API keys", async ({ page, signInAs }) => {
    await signInAs("svc-admin", keys);
    await expect(page.getByText("work-order-pipeline")).toBeVisible();
    await expectVisual(page, "33-settings-service-api-keys", { mask: ["time"] });
  });
});

test.describe("S10 security operators", () => {
  test("adds a person and a group, and removes one @smoke", async ({ page, signInAs }) => {
    await signInAs("svc-admin", operators);
    await expect(page.getByText("sec.op@example.test")).toBeVisible();
    await expect(page.getByText("security-operations")).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Add security operator" }).click();
    let d = page.getByRole("dialog");
    await d.getByLabel("Email").fill("new.op@example.test");
    await d.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("new.op@example.test")).toBeVisible();
    await page.getByRole("button", { name: "Add security operator" }).click();
    d = page.getByRole("dialog");
    await d.getByLabel("Type").selectOption("group");
    await d.getByLabel("Group name").fill("night-watch");
    await d.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("night-watch")).toBeVisible();
    await page.getByRole("button", { name: "Remove night-watch" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("night-watch")).toHaveCount(0);
    expect((await requestsWhere((r) => r.operationId === "AddSecurityOperator")).length).toBe(2);
    expect((await requestsWhere((r) => r.operationId === "RemoveSecurityOperator")).length).toBe(1);
  });

  test("a viewer never reads the operators", async ({ page, signInAs }) => {
    await signInAs("viewer", operators);
    await expect(page.getByRole("button", { name: "Add security operator" })).toHaveCount(0);
    expect((await requestsWhere((r) => r.operationId === "ListSecurityOperators")).length).toBe(0);
  });

  test("visual: S10 security operators", async ({ page, signInAs }) => {
    await signInAs("svc-admin", operators);
    await expect(page.getByText("security-operations")).toBeVisible();
    await expectVisual(page, "34-settings-security-operators", { mask: ["time"] });
  });
});
