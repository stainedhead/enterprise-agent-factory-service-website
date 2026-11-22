import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const url = `/t/${TEAMS[0].id}/config`;

test.describe("T7 configuration values", () => {
  test("shows namespace values, the agents using them and an agent's effective values @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", url);
    const row = page.getByRole("row").filter({ hasText: "GITHUB_ORG" });
    await expect(row).toContainText("acme-payments");
    await page.getByLabel("Agent", { exact: true }).selectOption({ label: "reviewer" });
    await expect(page.getByRole("cell", { name: "Agent value" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Namespace", exact: true })).toBeVisible();
    await expectAxeClean(page);
  });

  test("a credential-like name is refused with a link to Secrets", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Add value" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("DB_PASSWORD");
    await d.getByLabel("Value").fill("x");
    await d.getByRole("button", { name: "Save" }).click();
    await expect(d.getByRole("link", { name: "Go to Secrets" })).toBeVisible();
  });

  test("saving a value agents use warns; deleting it is refused with the agents listed", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Edit LOG_LEVEL" }).click();
    await expect(page.getByRole("dialog").getByText(/Saving restarts the agents/)).toBeVisible();
    await page.getByRole("dialog").getByLabel("Value").fill("debug");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("row").filter({ hasText: "LOG_LEVEL" }).first()).toContainText(
      "debug",
    );
    await page.getByRole("button", { name: "Delete LOG_LEVEL" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alert").getByRole("link", { name: "reviewer" })).toBeVisible();
    await page.getByRole("button", { name: "Delete GITHUB_ORG" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name: "GITHUB_ORG" })).toHaveCount(0);
  });

  test("viewers: both tables are read-only and nothing is sent", async ({ page, signInAs }) => {
    await signInAs("viewer", url);
    await expect(page.getByRole("cell", { name: "acme-payments" })).toBeVisible();
    for (const n of ["Add value", "Edit LOG_LEVEL", "Delete LOG_LEVEL"])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: T7", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("cell", { name: "acme-payments" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Agent value" })).toBeVisible();
    await expectVisual(page, "16-configuration", { mask: ["time"] });
  });
});
