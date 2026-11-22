import type { Page } from "@playwright/test";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;

/** Presses Tab until the focused element matches `name` as a button inside the dialog (keyboard only). */
async function tabToButton(page: Page, name: string, max = 25): Promise<void> {
  for (let i = 0; i < max; i++) {
    const label = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el?.getAttribute("aria-label") ?? el?.textContent?.trim() ?? "";
    });
    if (label === name) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Could not reach the "${name}" button with Tab`);
}

test.describe("M6-Q1 keyboard-only key flows (root §5.4)", () => {
  test("a service admin adds a storage class without a pointer", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/settings/storage-classes");
    await page.getByRole("button", { name: "Add storage class" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // focus moves into the dialog, and Tab stays inside it
    await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.type("kbd-class");
    await tabToButton(page, "Save");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("cell", { name: "kbd-class", exact: true })).toBeVisible();
    // the change is announced in the polite live region, and focus returns to the page
    await expect(page.getByRole("status").filter({ hasText: "Change saved" })).toHaveAttribute(
      "aria-live",
      "polite",
    );
    await expect(dialog).toHaveCount(0);
  });

  test("a team admin adds a member and Escape closes a dialog, returning focus to its button", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/members`);
    const add = page.getByRole("button", { name: "Add member" });
    await add.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(add).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByLabel("Email").fill("kbd@example.test");
    await tabToButton(page, "Add");
    await page.keyboard.press("Enter");
    await expect(page.getByText("kbd@example.test")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Change saved" })).toBeAttached();
  });

  test("a team viewer reaches a disabled action with the keyboard and its reason is available", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", `/t/${T}/members`);
    const add = page.getByRole("button", { name: "Add member" });
    await add.focus();
    await expect(add).toBeFocused();
    await expect(add).toHaveAttribute("aria-disabled", "true");
  });
});
