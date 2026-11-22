import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const url = "/external-systems";

test.describe("S7 external systems catalog", () => {
  test("built-ins have no Delete; a service switch shows in T9 as off for all teams @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", url);
    await expect(page.getByRole("switch", { name: "GitHub" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete GitHub" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete OpenAI API" })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("switch", { name: "Slack" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Slack" })).toContainText(
      "Off for all teams",
    );
    await page.goto(`/t/${TEAMS[0].id}/external-systems`);
    await expect(page.getByRole("row").filter({ hasText: "Slack" })).toContainText(
      "Off at service level",
    );
  });

  test("enabling an unmetered system needs a confirmation", async ({ page, signInAs }) => {
    await signInAs("svc-admin", url);
    const sw = page.getByRole("switch", { name: "OpenAI API" });
    await sw.click(); // on to off: no confirmation
    await expect(sw).not.toBeChecked();
    await sw.click();
    const d = page.getByRole("dialog");
    await expect(d).toContainText("not counted");
    expect((await requestsWhere((r) => r.operationId === "UpdateCatalogSystem")).length).toBe(1);
    await d.getByRole("button", { name: "Enable" }).click();
    await expect(page.getByRole("row").filter({ hasText: "OpenAI API" })).toContainText("On");
  });

  test("adds a custom system and lets a team declare its own", async ({ page, signInAs }) => {
    await signInAs("svc-admin", url);
    await page.getByRole("button", { name: "Add system" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("Datadog");
    await d.getByLabel("Slug").fill("datadog");
    await d.getByLabel("Endpoints").fill("api.datadoghq.com");
    await d.getByRole("button", { name: "Add system" }).click();
    await expect(page.getByRole("cell", { name: "Datadog", exact: true })).toBeVisible();
    const sw = page.getByRole("switch", { name: /may declare systems/ }).first();
    await sw.click();
    await expect
      .poll(async () => (await requestsWhere((r) => r.operationId === "UpdateTeam")).length)
      .toBeGreaterThan(0);
  });

  test("team admins do not get the catalog", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("button", { name: "Add system" })).toHaveCount(0);
  });

  test("visual: S7", async ({ page, signInAs }) => {
    await signInAs("svc-admin", url);
    await expect(page.getByRole("switch", { name: "GitHub" })).toBeVisible();
    await expect(page.getByRole("switch", { name: /may declare systems/ }).first()).toBeVisible();
    await expectVisual(page, "19-external-systems-catalog", { mask: ["time"] });
  });
});
