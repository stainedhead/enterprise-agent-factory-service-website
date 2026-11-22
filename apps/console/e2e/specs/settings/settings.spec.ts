import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const row = (page: import("@playwright/test").Page, text: string) =>
  page.getByRole("row").filter({ hasText: text });

test.describe("S10 settings", () => {
  test("lists settings, validates the range and saves with If-Match @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/settings/general");
    await expect(row(page, "audit.retention_days")).toContainText("30 to 3650");
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Edit audit.retention_days" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Value").fill("5");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText(/Enter 30 or more/).first()).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "PutSetting")).length).toBe(0);
    await dialog.getByLabel("Value").fill("90");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(row(page, "audit.retention_days")).toContainText("90");
    expect((await requestsWhere((r) => r.operationId === "PutSetting")).length).toBe(1);
  });

  test("visual: S10 settings", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/settings/general");
    await expect(row(page, "audit.retention_days")).toBeVisible();
    await expectVisual(page, "10a-admin-settings", { mask: ["time"] });
  });

  test("a team admin gets not-found for every section and sends no request for settings", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", "/settings/general");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await page.goto("/settings/identity-providers");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "GetSettings")).length).toBe(0);
    expect(await mutatingCount()).toBe(0);
  });
});

test.describe("S10 identity providers", () => {
  test("lists providers with the teams using one; Disable is blocked while in use @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/settings/identity-providers");
    await expect(row(page, "Corporate SSO")).toContainText("arn:aws:secretsmanager");
    await row(page, "Corporate SSO").getByRole("radio").check();
    await expect(page.getByRole("link", { name: "Payments" })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: /Actions/ }).click();
    await expect(page.getByRole("menuitem", { name: "Disable" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("adds a provider, disables an unused one and makes another the default", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/settings/identity-providers");
    await page.getByRole("button", { name: "Add provider" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill("Partners");
    await dialog.getByLabel("Issuer URL").fill("https://partners.example.test");
    await dialog.getByLabel("Console client id").fill("pc");
    await dialog.getByLabel("CLI client id").fill("pl");
    await expect(dialog.locator("code")).toContainText("afs admin create-identity-provider");
    await dialog.getByRole("button", { name: "Add" }).click();
    await expect(row(page, "Partners")).toBeVisible();
    await row(page, "Contractors").getByRole("radio").check();
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Make default" }).click();
    await expect(row(page, "Contractors")).toContainText("Default");
    await row(page, "Contractors").getByRole("radio").check();
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Disable" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
    await expect(row(page, "Contractors")).toContainText("Disabled");
  });

  test("visual: S10 identity providers", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/settings/identity-providers");
    await expect(row(page, "Corporate SSO")).toBeVisible();
    await expectVisual(page, "10b-admin-identity-providers", { mask: ["time"] });
  });
});
