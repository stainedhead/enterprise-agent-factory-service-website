import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { control } from "../../helpers/control.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const route = `/t/${T}/agents/new`;
/**
 * Records every `Storage.setItem` call made by the console, across the re-authentication redirect.
 * The page navigates to the IdP right after the carrier write, and a call through an exposed binding can be lost
 * to that navigation, so each write is also kept synchronously in `window.name` (it survives same-site
 * navigations) and merged in by `all()`.
 */
async function recordStorageWrites(
  page: import("@playwright/test").Page,
): Promise<{ all: () => Promise<string[]> }> {
  const bound: string[] = [];
  await page.exposeFunction("__recordStorageWrite", (k: string, v: string) => {
    bound.push(`${k}=${v}`);
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __recordStorageWrite?: (k: string, v: string) => void };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      try {
        const kept: string[] = window.name.startsWith("[") ? JSON.parse(window.name) : [];
        kept.push(`${k}=${String(v)}`);
        window.name = JSON.stringify(kept);
      } catch {
        // recording only; the binding below still sees the write
      }
      w.__recordStorageWrite?.(k, String(v));
      return set.call(this, k, v);
    };
  });
  return {
    all: async () => {
      const kept = await page.evaluate(() => (window.name.startsWith("[") ? window.name : "[]"));
      return [...bound, ...(JSON.parse(kept) as string[])];
    },
  };
}

// T3 has no secret input (bindings pick an existing secret by id). The secret-dialog half of FR-004 AC2 (a
// typed secret value never reaches storage, the secret input comes back empty) is covered with D-6, after C merges.
test.describe("drafts across re-authentication (FR-004)", () => {
  test("non-secret fields come back after the session expires and the user signs in again; no token reaches storage; sign-out removes the draft", async ({
    page,
    signInAs,
  }) => {
    const recorder = await recordStorageWrites(page);
    // a token that is due for renewal almost at once, with no refresh token: renewal goes through the IdP session
    await control.idp({ ttl: 63, refresh: false });
    await signInAs("team-admin", route);
    await expect(page.getByLabel("Template")).toHaveValue("coder");

    await page.getByLabel("Name", { exact: true }).fill("security-patcher");
    await page.getByLabel("Persona and instructions").fill("Patch CVEs, open one PR each");
    await page.getByRole("button", { name: "Add secret binding" }).click();
    await page.getByLabel("Secret 1", { exact: true }).selectOption({ label: "github-bot-key" });
    await page.getByLabel("Target of secret 1", { exact: true }).fill("GITHUB_APP_KEY");
    await page.getByRole("button", { name: "Add value" }).click();
    await page.getByLabel("Name of value 1").fill("LOG_LEVEL");

    // the IdP ends the user's session: the next renewal needs the user
    await control.idp({ revoke: true });
    const dialog = page.getByRole("dialog", { name: "Your session has expired" });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Sign in again" }).click();

    // back on the same route, with the non-secret fields restored
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("security-patcher");
    await expect(page.getByLabel("Persona and instructions")).toHaveValue(
      "Patch CVEs, open one PR each",
    );
    await expect(page.getByLabel("Target of secret 1", { exact: true })).toHaveValue(
      "GITHUB_APP_KEY",
    );
    await expect(page.getByLabel("Name of value 1")).toHaveValue("LOG_LEVEL");
    await expect(page.getByLabel("Template")).toHaveValue("coder");

    // the only draft write is the carrier key, holding the form's non-secret fields, no token
    const writes = await recorder.all();
    const draftWrites = writes.filter((w) => w.startsWith("afs.drafts="));
    expect(draftWrites.length).toBeGreaterThan(0);
    for (const w of writes) {
      expect(w).not.toMatch(/access_token|refresh_token|id_token|Bearer /);
    }
    expect(draftWrites.join("")).toContain("security-patcher");
    // restoring removed the carrier key from storage
    expect(await page.evaluate(() => sessionStorage.getItem("afs.drafts"))).toBeNull();

    // sign out: nothing of the draft stays in storage
    await page.getByRole("button", { name: /Tia Teamadmin/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/signed-out$/);
    expect(await page.evaluate(() => sessionStorage.getItem("afs.drafts"))).toBeNull();
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).filter((k) => k.startsWith("afs.drafts")),
      ),
    ).toEqual([]);
  });
});
