import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;

test("a team viewer reads every M4 team screen, every change is disabled, and no mutating request is sent @smoke", async ({
  page,
  signInAs,
}) => {
  // T8: agent AWS access, and the team view of identities
  await signInAs("viewer", `/t/${T}/agents/${AGENT_IDS[1]}?tab=secrets-identity`);
  await expect(page.getByText("Dedicated role for this agent")).toBeVisible();
  for (const n of ["Verify now", "Add cross-account role"])
    await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
  await page.goto(`/t/${T}/identities`);
  await expect(page.getByRole("heading", { name: "Agent identities" })).toBeVisible();
  await expect(page.getByLabel("Account filter")).toHaveAttribute("readonly", "");
  await expectAxeClean(page);

  // T13: team tags
  await page.goto(`/t/${T}/tags`);
  for (const n of ["Add tag", "Save tags"])
    await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");

  // T14: log delivery
  await page.goto(`/t/${T}/delivery/logs`);
  await expect(page.getByRole("cell", { name: "central-cloudwatch", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add destination" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // T11: report schedules
  await page.goto(`/t/${T}/reports?tab=schedules`);
  await expect(page.getByRole("cell", { name: "Weekly spend", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete Weekly spend" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  // T15: revisions, Restore disabled
  await page.goto(`/t/${T}/history/revisions`);
  await page
    .getByRole("row")
    .filter({ hasText: `team ${T}` })
    .nth(0)
    .getByRole("checkbox")
    .check();
  await expect(page.getByRole("button", { name: "Restore the selected revision" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );

  expect(await mutatingCount()).toBe(0);
});
