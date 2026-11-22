import type { Page } from "@playwright/test";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const url = `/teams/${TEAMS[0].id}/admin`;

async function open(page: Page, signInAs: (u: "svc-admin", p: string) => Promise<void>) {
  await signInAs("svc-admin", url);
  await page.getByRole("tab", { name: "AWS accounts" }).click();
  await expect(page.getByRole("cell", { name: "111122223333" })).toBeVisible();
}

test.describe("S6 team AWS accounts", () => {
  test("lists the accounts the filter allows with the pattern and agent links @smoke", async ({
    page,
    signInAs,
  }) => {
    await open(page, signInAs);
    const row = page.getByRole("row").filter({ hasText: "111122223333" });
    await expect(row).toContainText("*-payments");
    await expect(row).toContainText("1");
    await expect(page.getByRole("cell", { name: "222233334444" })).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("a narrowing change shows the links it disables and saves after confirming", async ({
    page,
    signInAs,
  }) => {
    await open(page, signInAs);
    await page.getByLabel("Account filter").fill("prod-payments");
    await page.getByRole("button", { name: "Save filter" }).click();
    const d = page.getByRole("dialog");
    await expect(d).toContainText("444455556666 (staging-payments): 1 link disabled");
    expect((await requestsWhere((r) => r.operationId === "UpdateTeam")).length).toBe(0);
    await d.getByRole("button", { name: "Save filter" }).click();
    await expect(page.getByRole("cell", { name: "444455556666" })).toHaveCount(0);
    expect((await requestsWhere((r) => r.operationId === "UpdateTeam")).length).toBe(1);
  });

  test("the service admin turns on the team's own account management", async ({
    page,
    signInAs,
  }) => {
    await open(page, signInAs);
    const sw = page.getByRole("switch", { name: "Team manages its own accounts" });
    await expect(sw).not.toBeChecked();
    await sw.click();
    await expect(sw).toBeChecked();
  });

  test("visual: S6 team AWS accounts", async ({ page, signInAs }) => {
    await open(page, signInAs);
    await expectVisual(page, "18-admin-team-aws-accounts", { mask: ["time"] });
  });
});
