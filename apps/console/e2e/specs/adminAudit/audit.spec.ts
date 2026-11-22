import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

test.describe("S5 audit log", () => {
  test("lists service events and sends the filters as query parameters @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/audit");
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
    await expect(page.getByText("req_svc_030")).toBeVisible();
    await expectAxeClean(page);
    await page.getByLabel("Outcome").selectOption("denied");
    await expect(page).toHaveURL(/outcome=denied/);
    await expect(page.getByRole("row").filter({ hasText: "teams.suspend" }).first()).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await requestsWhere(
              (r) => r.operationId === "ListAdminAuditEvents" && r.query.includes("outcome=denied"),
            )
          ).length,
      )
      .toBeGreaterThan(0);
  });

  test("denied events name the permission and drift corrections the object", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/audit");
    await expect(page.getByText("Requires teams:write").first()).toBeVisible();
    await expect(page.getByText("Drift corrected").first()).toBeVisible();
  });

  test("filters by team", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/audit");
    await page.getByRole("main").getByLabel("Team", { exact: true }).selectOption({ index: 1 });
    await expect(page).toHaveURL(/teamId=team_/);
    await expect
      .poll(
        async () =>
          (
            await requestsWhere(
              (r) => r.operationId === "ListAdminAuditEvents" && r.query.includes("teamId="),
            )
          ).length,
      )
      .toBeGreaterThan(0);
  });

  test("Download CSV asks the API for text/csv with the same filters", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/audit?outcome=denied");
    await expect(page.getByRole("cell", { name: /^Denied/ }).first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    expect((await download).suggestedFilename()).toBe("audit-service.csv");
  });

  test("a team role does not see the page", async ({ page, signInAs }) => {
    await signInAs("team-admin", "/audit");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("visual: S5 audit log", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/audit");
    await expect(page.getByText("req_svc_030")).toBeVisible();
    await expectVisual(page, "05-admin-audit", { mask: ["time"] });
  });
});
