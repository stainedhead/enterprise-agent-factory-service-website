import type { Page } from "@playwright/test";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { control, ENDPOINTS } from "../../helpers/control.js";
import { expect, test } from "../../helpers/test.js";

const T1 = TEAMS[0].id;

const twoProviders = async (page: Page) =>
  page.route("**/v1/identity-providers*", (route) =>
    route.fulfill({
      json: {
        items: ["idp_one", "idp_two"].map((id, i) => ({
          id,
          kind: i === 0 ? "okta" : "entra_id",
          name: i === 0 ? "Corporate SSO" : "Partner directory",
          issuerUrl: ENDPOINTS.idp,
          consoleClientId: "afs-console",
          cliClientId: "c",
          isDefault: i === 0,
        })),
      },
    }),
  );

// FR-013: with several providers, a reload after the IdP session ended goes through the picker. The route
// the user was on must survive the `login_required` callback.
test.describe("login_required keeps the return route (FR-013)", () => {
  test("a reload of a deep route, after the IdP session ended, returns to it through the picker", async ({
    page,
  }) => {
    await twoProviders(page);
    await control.idp({ user: "team-admin" });
    await page.goto("/sign-in");
    await page.getByRole("radio", { name: "Partner directory" }).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("banner")).toBeVisible();
    await page.goto(`/t/${T1}/agents`);
    await expect(page.getByRole("banner")).toBeVisible();

    // the provider session ends: the silent prompt=none attempt gets login_required
    await control.idp({ revoke: true });
    await page.reload();
    await expect(page).toHaveURL(
      new RegExp(`/sign-in\\?returnTo=${encodeURIComponent(`/t/${T1}/agents`)}`),
    );
    await expect(page.getByRole("radio", { name: "Partner directory" })).toBeChecked();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/t/${T1}/agents$`));
  });
});
