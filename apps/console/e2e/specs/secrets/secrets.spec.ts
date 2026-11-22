import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { SECRET_SENTINEL } from "../../fake-afs/fixtures/secrets.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const url = `/t/${T}/secrets`;
const ORIGINS = ["http://127.0.0.1:4173", ENDPOINTS.api, ENDPOINTS.idp];

test.describe("T4 secrets", () => {
  test("create: the typed value is sent once and found nowhere afterwards @smoke", async ({
    page,
    signInAs,
    observed,
  }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("cell", { name: "github-bot-key", exact: true })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Create secret" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("pagerduty-token");
    await d.getByLabel("Secret value").fill(SECRET_SENTINEL);
    await expect(d.locator("code").first()).toContainText("afs/afs-payments/pagerduty-token");
    await expect(d.getByText(/--secret-value file:\/\/<path>/)).toBeVisible();
    await d.getByRole("button", { name: "Create secret" }).click();
    await expect(page.getByRole("row").filter({ hasText: "pagerduty-token" })).toContainText(
      "Write-only",
    );
    expect(await scanForSentinels(page, [SECRET_SENTINEL], observed, ORIGINS)).toEqual([]);
    const posts = await requestsWhere((r) => r.operationId === "CreateSecret");
    expect(posts.length).toBe(1);
  });

  test("rotate warns which agents restart; the value is found nowhere afterwards", async ({
    page,
    signInAs,
    observed,
  }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Rotate github-bot-key" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByText(/reviewer/)).toBeVisible();
    await d.getByLabel("New secret value").fill(SECRET_SENTINEL);
    await d.getByRole("button", { name: "Rotate" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await scanForSentinels(page, [SECRET_SENTINEL], observed, ORIGINS)).toEqual([]);
    expect((await requestsWhere((r) => r.operationId === "RotateSecret")).length).toBe(1);
  });

  test("deleting a bound secret is refused with the agent linked; an unbound one is deleted", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Delete github-bot-key" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alert").getByRole("link", { name: "reviewer" })).toBeVisible();
    await page.getByRole("button", { name: "Delete artifactory-reader" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("artifactory-reader")).toHaveCount(0);
  });

  test("visual: T4", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("cell", { name: "github-bot-key", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "reviewer" }).first()).toBeVisible();
    await expectVisual(page, "09-team-secrets", { mask: ["time"] });
  });
});

test.describe("V2 secrets (viewer)", () => {
  test("shows names, paths, usage and rotation, no value, and sends no mutation", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", url);
    await expect(page.getByRole("cell", { name: "github-bot-key", exact: true })).toBeVisible();
    await expect(page.getByText("afs/afs-payments/github-bot-key")).toBeVisible();
    await expect(page.getByText("Every 90 days")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Write-only" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Rotate|Delete/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create secret" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: V2", async ({ page, signInAs }) => {
    await signInAs("viewer", url);
    await expect(page.getByRole("cell", { name: "github-bot-key", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "reviewer" }).first()).toBeVisible();
    await expectVisual(page, "13-viewer-secrets", { mask: ["time"] });
  });
});
