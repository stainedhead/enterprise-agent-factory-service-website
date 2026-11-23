import type { Page } from "@playwright/test";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { control, ENDPOINTS } from "../../helpers/control.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";

const T1 = TEAMS[0].id;
const T2 = TEAMS[1].id;

/** Records the token endpoint's answers, so the scan knows the exact values to look for. */
function captureTokens(page: Page): () => string[] {
  const values = new Set<string>();
  page.on("response", async (r) => {
    if (!r.url().endsWith("/token")) return;
    const b = (await r.json().catch(() => ({}))) as Record<string, string>;
    for (const k of ["access_token", "refresh_token", "id_token"]) if (b[k]) values.add(b[k]);
  });
  return () => [...values];
}

const twoProviders = async (page: Page) =>
  page.route("**/v1/identity-providers*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "idp_one",
            kind: "okta",
            name: "Corporate SSO",
            issuerUrl: ENDPOINTS.idp,
            consoleClientId: "afs-console",
            cliClientId: "c",
            isDefault: true,
          },
          {
            id: "idp_two",
            kind: "entra_id",
            name: "Partner directory",
            issuerUrl: ENDPOINTS.idp,
            consoleClientId: "afs-console",
            cliClientId: "c",
            isDefault: false,
          },
        ],
      },
    }),
  );

test.describe("sign-in", () => {
  test("signs in and keeps every token out of storage, cookies, URL, console, cache, DOM and telemetry @smoke", async ({
    page,
    signInAs,
    observed,
  }) => {
    const tokens = captureTokens(page);
    await signInAs("team-admin", `/t/${T1}`);
    await expect(page).toHaveURL(new RegExp(`/t/${T1}$`));
    expect(tokens().length).toBe(3);
    // a page that makes API calls, so the cache is populated too
    await page.getByRole("combobox", { name: "Search" }).fill("pay");
    await expect(
      page.getByRole("group", { name: "Teams" }).getByRole("option", { name: "Payments" }),
    ).toBeVisible();
    const hits = await scanForSentinels(page, tokens(), observed, [
      `http://127.0.0.1:4173`,
      ENDPOINTS.api,
      ENDPOINTS.idp,
    ]);
    expect(hits).toEqual([]);
  });

  test("reload returns to the same route through a silent prompt=none, never the IdP page", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", `/t/${T1}/agents`);
    const authorizes: string[] = [];
    page.on("request", (r) => {
      if (r.url().startsWith(`${ENDPOINTS.idp}/authorize`)) authorizes.push(r.url());
    });
    await page.reload();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/t/${T1}/agents$`));
    expect(authorizes.length).toBeGreaterThan(0);
    for (const u of authorizes) expect(new URL(u).searchParams.get("prompt")).toBe("none");
  });

  test("a reload after the IdP session ended signs in again with the only provider", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", `/t/${T1}`);
    await control.idp({ revoke: true });
    await page.reload();
    // one provider: straight back to the IdP, which signs the seeded user in again
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/t/${T1}$`));
  });

  test("sign out in one tab signs out a second tab and lands on /signed-out", async ({
    page,
    context,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T1}`);
    const second = await context.newPage();
    await second.goto(`/t/${T1}`);
    await expect(second.getByRole("banner")).toBeVisible();
    await page.getByRole("button", { name: /Tia Teamadmin/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/signed-out$/);
    await expect(second).toHaveURL(/\/signed-out$/);
    await expect(second.getByRole("heading", { name: "You have signed out" })).toBeVisible();
    await expectAxeClean(second);
  });

  test("several providers show the picker with the default preselected; the choice is remembered", async ({
    page,
  }) => {
    await twoProviders(page);
    await control.idp({ user: "viewer" });
    await page.goto("/sign-in");
    await expect(page.getByRole("radio", { name: "Corporate SSO" })).toBeChecked();
    await expectAxeClean(page);
    await page.getByRole("radio", { name: "Partner directory" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("banner")).toBeVisible();
    await page.goto("/sign-in");
    await expect(page.getByRole("radio", { name: "Partner directory" })).toBeChecked();
  });

  test("?provider= skips the picker and ?teamId= opens that team", async ({ page }) => {
    await twoProviders(page);
    await control.idp({ user: "team-admin" });
    await page.goto("/sign-in?provider=idp_two");
    await expect(page.getByRole("banner")).toBeVisible();
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await control.idp({ revoke: true });
    await page.goto(`/sign-in?teamId=${T1}`);
    await expect(page).toHaveURL(new RegExp(`/t/${T1}$`));
  });

  test("?teamId= for a team the caller cannot see is a not-found page that offers another provider", async ({
    page,
  }) => {
    await control.idp({ user: "viewer" });
    await page.goto(`/sign-in?teamId=${T2}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in with another provider" })).toBeVisible();
    await expect(page.getByText(/forbidden/i)).toHaveCount(0);
  });

  test("a configuration error is a page, not a blank screen", async ({ page, context }) => {
    await context.route("**/config.json", (r) => r.fulfill({ json: { apiUrl: "nope" } }));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Configuration error" })).toBeVisible();
    await expect(page.getByText(/apiUrl must be an https URL/)).toBeVisible();
    await expectAxeClean(page);
  });
});
