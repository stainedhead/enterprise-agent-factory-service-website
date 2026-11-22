import type { Page } from "@playwright/test";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const revisions = `/t/${T}/history/revisions`;
const restores = () => requestsWhere((r) => r.operationId === "RestoreRevision");
// the team's revisions are listed newest first: 4, 3, 2
const teamRow = (page: Page, rev: number) =>
  page
    .getByRole("row")
    .filter({ hasText: `team ${T}` })
    .nth(4 - rev);

test.describe("T15 restore", () => {
  test("shows the plan with what is skipped, then applies after confirming @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", revisions);
    await teamRow(page, 3).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Restore the selected revision" }).click();
    const d = page.getByRole("dialog", { name: "Restore revision 3" });
    await expect(d.getByText(/maxBudgetUsd: 6000.00 → 5000.00/)).toBeVisible();
    await expect(d.getByText(/The secret no longer exists/)).toBeVisible();
    await expectAxeClean(page);
    const sent = await restores();
    expect(sent.length).toBe(1);
    await d.getByRole("button", { name: "Apply restore" }).click();
    expect((await restores()).length).toBe(1);
    await page
      .getByRole("dialog", { name: "Apply restore of revision 3" })
      .getByRole("button", { name: "Restore" })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect((await restores()).length).toBe(2);
    // the restore is a new revision
    await expect(page.getByRole("row").filter({ hasText: `team ${T}` })).toHaveCount(4);
  });

  test("the latest revision has nothing to restore", async ({ page, signInAs }) => {
    await signInAs("team-admin", revisions);
    await teamRow(page, 4).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Restore the selected revision" }).click();
    await expect(page.getByText(/already matches/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Apply restore" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("a viewer can diff but Restore is disabled, and nothing is sent", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", revisions);
    await teamRow(page, 3).getByRole("checkbox").check();
    await teamRow(page, 4).getByRole("checkbox").check();
    await expect(page.getByText(/Revision 3 to revision 4/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Restore the selected revision" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(await mutatingCount()).toBe(0);
    expect((await restores()).length).toBe(0);
  });

  test("the API's 403 on a restore is shown", async ({ page, signInAs }) => {
    await signInAs("team-admin", revisions);
    await page.route(/:restore$/, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "AccessDenied",
          message: "Requires revisions:restore",
          requestId: "req_x",
        }),
      }),
    );
    await teamRow(page, 3).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Restore the selected revision" }).click();
    await expect(page.getByText("You do not have access")).toBeVisible();
  });
});
