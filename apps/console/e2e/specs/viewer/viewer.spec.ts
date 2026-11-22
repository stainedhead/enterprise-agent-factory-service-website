import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;

test("a team viewer reads T1, V1, T6 and T15 in one session and sends no mutating request", async ({
  page,
  signInAs,
}) => {
  await signInAs("viewer", `/t/${T}`);
  // V1: the viewer's overview, read-only
  await expect(page.getByText("Read-only access")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("button", { name: "Create agent" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expectAxeClean(page);

  // T6: members visible, controls disabled, no API keys tab
  await page.getByRole("link", { name: "Members & access" }).click();
  await expect(page.getByText("team.admin@example.test")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add member" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("tab", { name: "API keys" })).toHaveCount(0);
  await expectAxeClean(page);

  // T15: config revisions are readable; two selected revisions diff without a write
  await page.getByRole("link", { name: "Config revisions" }).click();
  const rows = page.getByRole("row").filter({ hasText: `team ${T}` });
  await expect(rows).toHaveCount(3);
  await rows.nth(0).getByRole("checkbox").check();
  await rows.nth(1).getByRole("checkbox").check();
  await expect(page.getByText(/Revision 3 to revision 4/)).toBeVisible();
  await expectAxeClean(page);

  // the viewer holds no audit permission: the audit route is not found and nothing is read
  await page.goto(`/t/${T}/history/audit`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await requestsWhere((r) => r.operationId === "ListAuditEvents")).length).toBe(0);

  // the API-keys route is not found for a viewer, and the keys are never read
  await page.goto(`/t/${T}/members/api-keys`);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect((await requestsWhere((r) => r.operationId === "ListApiKeys")).length).toBe(0);

  expect(await mutatingCount()).toBe(0);
});
