import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { control } from "../../helpers/control.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T1 = TEAMS[0].id;
const nav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Main" });

test.describe("shell per seeded user", () => {
  test("service admin: service navigation, All teams switcher, admin role pill @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin");
    const header = page.getByRole("banner");
    await expect(header.getByText("Service admin")).toBeVisible();
    await expect(header.getByText("e2e")).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Teams" })).toBeVisible();
    const sel = nav(page).locator("#team-switcher");
    await expect(sel.locator("option")).toHaveText(["All teams"]);
    await expectAxeClean(page);
  });

  test("team-admin: sees exactly their team, team navigation, no service areas", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin");
    await expect(page).toHaveURL(new RegExp(`/t/${T1}$`));
    await expect(page.getByRole("banner").getByText("Team-admin")).toBeVisible();
    await expect(nav(page).locator("#team-switcher").locator("option")).toHaveText(["payments"]);
    await expect(nav(page).getByText("Service", { exact: true })).toHaveCount(0);
    await expect(nav(page).getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Agents" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("viewer: read-only navigation and a viewer pill", async ({ page, signInAs }) => {
    await signInAs("viewer");
    await expect(page.getByRole("banner").getByText("Team viewer")).toBeVisible();
    await expect(nav(page).getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(nav(page).getByText("Service", { exact: true })).toHaveCount(0);
  });

  test("security operator: service audit access without team areas", async ({ page, signInAs }) => {
    await signInAs("sec-op");
    await expect(page.getByRole("banner").getByText("Security operator")).toBeVisible();
    await expect(nav(page).locator("#team-switcher")).toHaveCount(0);
  });

  test("the team switcher moves between All teams and a team", async ({ page, signInAs }) => {
    await signInAs("svc-admin", `/t/${T1}`);
    await expect(page).toHaveURL(new RegExp(`/t/${T1}$`));
    await nav(page).locator("#team-switcher").selectOption("");
    await expect(page).toHaveURL(/\/$/);
  });

  test("search issues only list calls, once, and no mutating request", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin");
    await control.reset(); // the console keeps its session; the recorder starts empty
    const box = page.getByRole("combobox", { name: "Search" });
    // the dashboard behind the search is still loading its own panels: only calls made from here on count
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForTimeout(1500);
    const since = Date.now();
    await page.keyboard.press("/");
    await expect(box).toBeFocused();
    await box.fill("p");
    await box.fill("pl");
    await box.fill("pla");
    await expect(
      page.getByRole("group", { name: "Teams" }).getByRole("option", { name: "Platform" }),
    ).toBeVisible();
    // read the recorder before navigating: the team page the search opens makes its own reads
    const calls = await requestsWhere((r) => r.at >= since);
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/t/${TEAMS[1].id}$`));
    const ops = new Set(calls.map((c) => c.operationId));
    expect(
      [...ops].filter((o) => !["ListTeams", "ListWorkOrders", "GetMe"].includes(o ?? "")),
    ).toEqual([]);
    expect(calls.filter((c) => c.operationId === "ListTeams").length).toBe(1);
    expect(calls.filter((c) => c.operationId === "ListWorkOrders").length).toBe(1);
    expect((await requestsWhere((r) => r.at >= since && r.mutating)).length).toBe(0);
  });

  test("GetMe 503 at boot is a full-page error with Retry", async ({ page }) => {
    await control.idp({ user: "viewer" });
    await control.inject({ match: "GET /v1/me", status: 503, times: 6 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "AFS is not responding" })).toBeVisible();
    await expectAxeClean(page);
    await control.reset();
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("a newer server contract shows a dismissible reload notice", async ({ page, signInAs }) => {
    await control.contractVersion("99.0.0");
    await signInAs("viewer");
    await expect(page.getByText(/A newer version of AFS is available; reload/)).toBeVisible();
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.getByText(/A newer version of AFS is available/)).toHaveCount(0);
  });
});

test.describe("system pages", () => {
  test("no-access page for a principal with no team and no service role", async ({
    page,
    context,
  }) => {
    await context.route("**/v1/me", (r) =>
      r.fulfill({
        json: {
          principal: { id: "usr_x", type: "user" },
          serviceAdmin: false,
          securityOperator: false,
          teams: [],
        },
      }),
    );
    await control.idp({ user: "viewer" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "No access yet" })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/signed-out$/);
    expect((await requestsWhere((r) => r.operationId === "ListTeams")).length).toBe(0);
  });

  test("sign-in, signed-out and not-found pages are axe-clean", async ({ page, signInAs }) => {
    await page.goto("/signed-out");
    await expectAxeClean(page);
    await signInAs("viewer", "/no/such/page");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expectAxeClean(page);
  });
});

test.describe("visual baselines (pending approval, WD-11)", () => {
  test("sign-in picker", async ({ page, context }) => {
    await context.route("**/v1/identity-providers*", (r) =>
      r.fulfill({
        json: {
          items: [
            {
              id: "idp_one",
              kind: "okta",
              name: "Corporate SSO",
              issuerUrl: "http://127.0.0.1:4401",
              consoleClientId: "c",
              cliClientId: "c",
              isDefault: true,
            },
            {
              id: "idp_two",
              kind: "entra_id",
              name: "Partner directory",
              issuerUrl: "http://127.0.0.1:4401",
              consoleClientId: "c",
              cliClientId: "c",
              isDefault: false,
            },
          ],
        },
      }),
    );
    await page.goto("/sign-in");
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await expectVisual(page, "sign-in");
  });

  test("not found", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/no/such/page");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expectVisual(page, "not-found");
  });
});
