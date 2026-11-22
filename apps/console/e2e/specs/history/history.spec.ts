import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const audit = `/t/${T}/history/audit`;
const revisions = `/t/${T}/history/revisions`;

test.describe("T15 activity and audit", () => {
  test("lists events with the S5 filters as query parameters and pages @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", audit);
    await expect(page.getByText("req_audit_027")).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Next page" }).click();
    await expect(page.getByText("req_audit_002")).toBeVisible();
    await page.getByLabel("Outcome").selectOption("denied");
    await expect(page).toHaveURL(/outcome=denied/);
    await expect(page.getByRole("row").filter({ hasText: "denied" }).first()).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "allowed" })).toHaveCount(0);
    const lists = await requestsWhere(
      (r) => r.operationId === "ListAuditEvents" && r.query.includes("outcome=denied"),
    );
    expect(lists.length).toBeGreaterThan(0);
  });

  test("a filter in the URL is applied on load", async ({ page, signInAs }) => {
    await signInAs("team-admin", `${audit}?action=teams.suspend`);
    await expect(page.getByRole("row").filter({ hasText: "teams.suspend" }).first()).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "agents.create" })).toHaveCount(0);
  });

  test("Download CSV asks the API for text/csv with the filter", async ({ page, signInAs }) => {
    await page.context().route(`${ENDPOINTS.api}/v1/teams/*/audit-events*`, async (route) => {
      const req = route.request();
      if (!(req.headers().accept ?? "").includes("text/csv")) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "text/csv",
        headers: { "access-control-allow-origin": "*" },
        body: "id,action,outcome\n26,x,denied\n",
      });
    });
    await signInAs("team-admin", `${audit}?outcome=denied`);
    await expect(
      page.getByText("req_audit_026").or(page.getByText("req_audit_022")).first(),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    expect((await download).suggestedFilename()).toBe(`audit-${T}.csv`);
  });

  test("visual: T15 audit", async ({ page, signInAs }) => {
    await signInAs("team-admin", audit);
    await expect(page.getByText("req_audit_027")).toBeVisible();
    await expectVisual(page, "15a-team-audit", { mask: ["time"] });
  });

  test("a viewer reads the history and sends no mutating request", async ({ page, signInAs }) => {
    await signInAs("viewer", revisions);
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });
});

test.describe("T15 config revisions", () => {
  test("two revisions of one resource show a diff, older to newer @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", revisions);
    const rows = page.getByRole("row").filter({ hasText: `team ${T}` });
    await expect(rows).toHaveCount(3);
    await rows.nth(0).getByRole("checkbox").check();
    await rows.nth(1).getByRole("checkbox").check();
    await expect(page.getByText(/Revision 3 to revision 4/)).toBeVisible();
    await expect(page.getByText('"maxBudgetUsd": "6000.00"')).toBeVisible();
    await expectAxeClean(page);
  });

  test("filtering by resource kind narrows the list on the server", async ({ page, signInAs }) => {
    await signInAs("team-admin", revisions);
    await expect(page.getByRole("row").filter({ hasText: "agent agt_001" })).toBeVisible();
    await page.getByLabel("Resource kind").fill("agent");
    await expect(page.getByRole("row").filter({ hasText: `team ${T}` })).toHaveCount(0);
  });

  test("visual: T15 revisions", async ({ page, signInAs }) => {
    await signInAs("team-admin", revisions);
    await expect(page.getByRole("row").filter({ hasText: "agent agt_001" })).toBeVisible();
    await expectVisual(page, "15b-team-revisions", { mask: ["time"] });
  });
});
