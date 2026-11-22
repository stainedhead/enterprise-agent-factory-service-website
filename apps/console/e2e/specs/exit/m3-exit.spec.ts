import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { openFrozen, spaGo } from "../../helpers/clock.js";
import { mutatingCount } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;

test("M3 exit: a team viewer reads every M3 team screen and sends no mutating request", async ({
  page,
  signInAs,
}) => {
  await openFrozen(page, signInAs, "viewer", `/t/${T}/budget`);
  await expect(page.getByRole("button", { name: "Edit budget" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await spaGo(page, `/t/${T}/reports`);
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download CSV" })).toBeVisible();
  await spaGo(page, `/t/${T}/reports/agents/${AGENT_IDS[0]}`);
  await expect(page.getByRole("heading", { name: /Report for/ })).toBeVisible();
  await spaGo(page, `/t/${T}/delivery/notifications`);
  await expect(page.getByRole("button", { name: "Add channel" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expectAxeClean(page);
  // service screens are not found for a team role
  await spaGo(page, "/reports");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await spaGo(page, "/models");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  expect(await mutatingCount()).toBe(0);
});
