import { openFrozen, spaGo } from "../../helpers/clock.js";
import { mutatingCount } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { TEAM_ROUTES } from "./routes.js";

/** Verbs that change state; a button that starts with one must be disabled for a viewer. */
const CHANGES =
  /^(Add|Create|Delete|Remove|Edit|Rotate|Save|Restart|Suspend|Resume|Apply|Turn|Enable|Disable|Change|Import|Cancel work|Schedule|Update|Rollback|Restore)\b/;

test("M6-Q3: a team viewer over every team screen sends no mutating request and every change control is disabled", async ({
  page,
  signInAs,
}) => {
  test.setTimeout(180_000);
  await openFrozen(page, signInAs, "viewer", "/");
  let seen = 0;
  for (const path of TEAM_ROUTES) {
    await spaGo(page, path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    // one read of the page: a button that disappears mid-loop must not stall the test
    const enabled = await page.evaluate((source) => {
      const re = new RegExp(source);
      return Array.from(document.querySelectorAll("main button"))
        .map((b) => ({
          name: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
          off: b.getAttribute("aria-disabled") === "true" || (b as HTMLButtonElement).disabled,
        }))
        .filter((b) => re.test(b.name))
        .map((b) => ({ name: b.name, off: b.off }));
    }, CHANGES.source);
    seen += enabled.length;
    expect(
      enabled.filter((b) => !b.off).map((b) => b.name),
      `${path}: change controls enabled for a viewer`,
    ).toEqual([]);
  }
  // the check is live: the screens do offer change controls, and a viewer found them all disabled
  expect(seen).toBeGreaterThan(10);
  expect(await mutatingCount()).toBe(0);
});
