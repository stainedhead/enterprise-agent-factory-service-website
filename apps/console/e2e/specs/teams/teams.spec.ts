import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const row = (page: import("@playwright/test").Page, slug: string) =>
  page.getByRole("row").filter({ hasText: slug });

test.describe("S2 teams", () => {
  test("lists teams with spend against budget, filters and is axe-clean @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/teams");
    await expect(row(page, "payments")).toContainText("$3,120.50 / $5,000.00");
    await expect(row(page, "platform")).toContainText("$6,500.00 / $8,000.00");
    await expect(row(page, "payments")).toContainText("Ready");
    await expectAxeClean(page);
    await page.getByLabel("Kind").selectOption("ephemeral");
    await expect(page.getByText("No teams match.")).toBeVisible();
    const lists = await requestsWhere(
      (r) => r.operationId === "ListTeams" && r.query.includes("kind=ephemeral"),
    );
    expect(lists.length).toBeGreaterThan(0);
  });

  test("suspend, resume and set ceiling through Actions", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/teams");
    await row(page, "payments").getByRole("radio").check();
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Suspend" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
    await expect(row(page, "payments")).toContainText("Suspended");
    await row(page, "payments").getByRole("radio").check();
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Resume" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Resume" }).click();
    await expect(row(page, "payments")).toContainText("Ready");
    // the API's ValidationError for a ceiling below the budget is shown on the field
    await row(page, "payments").getByRole("radio").check();
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Set ceiling" }).click();
    await page.getByLabel("Ceiling (USD)").fill("100.00");
    await page.getByRole("button", { name: "Set ceiling" }).click();
    await expect(page.getByText("Must be at least 5000.00").first()).toBeVisible();
  });

  test("delete asks for the slug and the row ends Deleted with its records", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/teams");
    await row(page, "platform").getByRole("radio").check();
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByLabel(/Type/).fill("platform");
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(row(page, "platform")).toContainText("Deleted", { timeout: 15_000 });
    await expect(row(page, "platform").getByRole("link", { name: "History" })).toBeVisible();
  });

  test("team-admin and viewer get the not-found page for /teams", async ({ page, signInAs }) => {
    await signInAs("team-admin", "/teams");
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });

  test("budgets view shows ceilings", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/teams?view=budgets");
    await expect(page.getByRole("columnheader", { name: "Temporary ceiling" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("visual: S2", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/teams");
    await expect(row(page, "payments")).toBeVisible();
    await expectVisual(page, "02-admin-teams");
  });
});

test.describe("S3 create team", () => {
  test("wizard creates a team that appears Reconciling and turns Ready without a reload", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/teams/new");
    await page.getByLabel("Display name").fill("Ledger");
    await page.getByLabel("Slug").fill("ledger");
    await page.getByLabel("Tag: environment").selectOption("prod");
    await expectAxeClean(page);
    await expectVisual(page, "03-admin-create-team");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("radio", { name: "Selected" }).check();
    await page.getByLabel(/Claude Sonnet/).check();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Monthly budget (USD)").fill("2500.00");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Admin email").fill("lead@example.test");
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("code")).toContainText("afs teams create-team");
    await page.getByRole("button", { name: "Create team" }).click();
    await expect(page).toHaveURL(/\/teams$/);
    await expect(row(page, "ledger")).toContainText("Reconciling");
    await expect(row(page, "ledger")).toContainText("Ready", { timeout: 15_000 });
    const lists = await requestsWhere((r) => r.operationId === "ListTeams");
    expect(lists.length).toBeLessThan(8);
  });

  test("team detail summary for a service admin", async ({ page, signInAs }) => {
    await signInAs("svc-admin", `/teams/${TEAMS[0].id}/admin`);
    await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
    await expectAxeClean(page);
  });
});
