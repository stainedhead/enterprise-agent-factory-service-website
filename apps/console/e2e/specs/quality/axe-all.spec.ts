import type { Page } from "@playwright/test";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { openFrozen, spaGo } from "../../helpers/clock.js";
import { asEphemeral } from "../../helpers/ephemeralTeam.js";
import { expect, test } from "../../helpers/test.js";
import { POOL_ROUTES, SERVICE_ROUTES, TEAM_ROUTES } from "./routes.js";

/** Waits until the page has left its loading state, then for the first heading. */
async function settled(page: Page, found = true, path = page.url()): Promise<void> {
  const h1 = page.getByRole("heading", { level: 1 }).first();
  await expect(h1).toBeVisible();
  // a route that exists for this role must not land on the not-found page (it would pass axe trivially)
  if (found) await expect(h1, path).not.toHaveText("Page not found");
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test.describe("M6-Q1 axe over every screen", () => {
  test("a service admin: every service and team route is clean", async ({ page, signInAs }) => {
    test.setTimeout(240_000);
    await openFrozen(page, signInAs, "svc-admin", "/");
    for (const path of [...SERVICE_ROUTES, ...TEAM_ROUTES]) {
      await spaGo(page, path);
      await settled(page, true, path);
      await expectAxeClean(page);
    }
  });

  test("an ephemeral team: the pools screens are clean", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "svc-admin", "/");
    await asEphemeral(page);
    for (const path of POOL_ROUTES) {
      await spaGo(page, path);
      await settled(page, true, path);
      await expectAxeClean(page);
    }
  });

  test("a team admin: every team route is clean", async ({ page, signInAs }) => {
    test.setTimeout(180_000);
    await openFrozen(page, signInAs, "team-admin", "/");
    for (const path of TEAM_ROUTES) {
      await spaGo(page, path);
      await settled(page, true, path);
      await expectAxeClean(page);
    }
  });

  test("a team viewer: every team route is clean", async ({ page, signInAs }) => {
    test.setTimeout(180_000);
    await openFrozen(page, signInAs, "viewer", "/");
    for (const path of TEAM_ROUTES) {
      await spaGo(page, path);
      await settled(page, false);
      await expectAxeClean(page);
    }
  });

  test("a security operator: work orders, a work order and swarm templates are clean", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "sec-op", "/");
    for (const path of ["/work-orders", "/work-orders/new", "/swarm-templates"]) {
      await spaGo(page, path);
      await settled(page, true, path);
      await expectAxeClean(page);
    }
  });

  test("dialogs are clean: the main create or add dialog of each screen", async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(240_000);
    await openFrozen(page, signInAs, "svc-admin", "/");
    const dialogs: [string, string][] = [
      ["/settings/storage-classes", "Add storage class"],
      ["/settings/agent-templates", "Add agent template"],
      ["/settings/identity-providers", "Add provider"],
      ["/settings/notification-channels", "Add channel"],
      ["/settings/service-api-keys", "Create service API key"],
      ["/settings/security-operators", "Add security operator"],
      ["/swarm-templates", "Create template"],
      [`/t/${TEAMS[0].id}/members`, "Add member"],
      [`/t/${TEAMS[0].id}/members/api-keys`, "Create API key"],
      [`/t/${TEAMS[0].id}/secrets`, "Create secret"],
      [`/t/${TEAMS[0].id}/config`, "Add value"],
    ];
    for (const [path, name] of dialogs) {
      await spaGo(page, path);
      await settled(page, true, path);
      const b = page.getByRole("button", { name }).first();
      await expect(b, `${path} offers ${name}`).toBeVisible();
      await b.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expectAxeClean(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
});
