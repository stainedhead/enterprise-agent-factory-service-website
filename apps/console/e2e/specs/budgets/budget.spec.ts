import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { openFrozen } from "../../helpers/clock.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const url = `/t/${TEAMS[0].id}/budget`;

test.describe("T5 budget and usage", () => {
  test("shows the month so far, the daily split and spend by agent @smoke", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "team-admin", url);
    await expect(page.getByRole("heading", { name: "Budget & usage" })).toBeVisible();
    await expect(page.getByText("$4,100.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Projected to hit cap on 27 Nov/)).toBeVisible();
    await expect(page.getByText(/Reconciled \(20 Nov\)/)).toBeVisible();
    await expect(page.getByRole("group", { name: "Daily spend chart" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "reviewer", exact: true })).toBeVisible();
    await page.getByText("Data table").click();
    await expect(page.getByRole("table", { name: "Daily spend (USD)" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("refuses an amount above the ceiling before calling the API, then saves", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "team-admin", url);
    await page.getByRole("button", { name: "Edit budget" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Amount (USD)").fill("9000.00");
    await d.getByRole("button", { name: "Save" }).click();
    await expect(d).toContainText("above the team's ceiling of $5,000.00");
    expect((await requestsWhere((r) => r.operationId === "PutBudget")).length).toBe(0);
    await d.getByLabel("Amount (USD)").fill("4500.00");
    await d.getByRole("button", { name: "Save" }).click();
    await expect(d).toHaveCount(0);
    await expect(page.getByText("Amount", { exact: true })).toBeVisible();
    await expect(page.getByText("$4,500.00", { exact: true })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "PutBudget")).length).toBe(1);
  });

  test("only a service admin is offered the action at exhaustion", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "team-admin", url);
    await page.getByRole("button", { name: "Edit budget" }).click();
    await expect(page.getByLabel("At exhaustion")).toHaveCount(0);
  });

  test("a service admin can choose the action and reach the guardrails", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "svc-admin", url);
    await expect(page.getByRole("link", { name: "Ceiling, override and quotas" })).toBeVisible();
    await page.getByRole("button", { name: "Edit budget" }).click();
    await expect(page.getByLabel("At exhaustion")).toBeVisible();
  });

  test("a viewer reads the page and sends no mutating request", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "viewer", url);
    await expect(page.getByRole("button", { name: "Edit budget" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: T5", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "team-admin", url);
    await expect(page.getByRole("group", { name: "Daily spend chart" })).toBeVisible();
    await expectVisual(page, "10-team-budget", { mask: ["time"] });
  });
});
