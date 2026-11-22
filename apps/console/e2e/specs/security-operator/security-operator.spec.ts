import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main" });

test.describe("Security operator console", () => {
  test("header says Security operator, navigation is only Work orders and Swarm templates, landing on /work-orders @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op");
    await expect(page.getByRole("banner").getByText("Security operator")).toBeVisible();
    await expect(page).toHaveURL(/\/work-orders$/);
    const links = nav(page).getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText("Work orders");
    await expect(links.nth(1)).toHaveText("Swarm templates");
    await expect(nav(page).locator("#team-switcher")).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("team-scoped and service-admin routes are not found, and no team-scoped request is sent", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op");
    for (const path of [`/t/${TEAMS[0].id}`, `/t/${TEAMS[0].id}/agents`, "/teams", "/audit"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    }
    const teamScoped = await requestsWhere((r) => /^\/v1\/teams\/[^/]+/.test(r.path));
    expect(teamScoped).toEqual([]);
    expect(await mutatingCount()).toBe(0);
  });
});
