import { join } from "node:path";
import { expect, type Page } from "@playwright/test";

/**
 * Compares the page with its baseline at 1440 x 900, device scale 2 (the mockups are 2880 x 1800),
 * allowing 0.5% of pixels to differ (WD-11). Animations are off so captures are stable.
 */
export async function expectVisual(
  page: Page,
  name: string,
  opts: { mask?: string[] } = {},
): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await captureForDocs(page, name);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: "disabled",
    scale: "device", // 2880 x 1800, the size of the mockups
    caret: "hide",
    maxDiffPixelRatio: 0.005,
    mask: (opts.mask ?? []).map((s) => page.locator(s)),
  });
}

/**
 * When AFS_DOCS_SCREENSHOTS names a folder, also saves the page there unmasked at 1440 x 900, for the
 * README and user guides (`bun run --filter @afs/console docs:screenshots`). It never affects the comparison.
 */
async function captureForDocs(page: Page, name: string): Promise<void> {
  const dir = process.env.AFS_DOCS_SCREENSHOTS;
  if (!dir) return;
  await page.screenshot({
    path: join(dir, `${name}.png`),
    animations: "disabled",
    caret: "hide",
    scale: "css",
  });
}
