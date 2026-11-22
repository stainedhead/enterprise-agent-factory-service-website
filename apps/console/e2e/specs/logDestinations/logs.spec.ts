import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const logs = `/t/${TEAMS[0].id}/delivery/logs`;

test.describe("T14 log delivery", () => {
  test("lists destinations with their delivery status and the reason when failing @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", logs);
    await expect(page.getByRole("cell", { name: "central-cloudwatch", exact: true })).toBeVisible();
    await expect(page.getByText("HTTP 403 from the HEC endpoint")).toBeVisible();
    await expectAxeClean(page);
  });

  test("adds a destination with a secret reference and refuses a missing one first", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", logs);
    await page.getByRole("button", { name: "Add destination" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("dd");
    await d.getByLabel("Kind").selectOption("datadog");
    await d.getByLabel("Datadog site").fill("datadoghq.com");
    await d.getByRole("button", { name: "Add destination" }).click();
    await expect(d).toContainText("Choose the secret");
    expect((await requestsWhere((r) => r.operationId === "CreateLogDestination")).length).toBe(0);
    await d.getByLabel("Credential secret").selectOption({ label: "github-bot-key" });
    await d.getByRole("button", { name: "Add destination" }).click();
    await expect(page.getByRole("cell", { name: "dd", exact: true })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "CreateLogDestination")).length).toBe(1);
  });

  test("edits, disables and deletes a destination", async ({ page, signInAs }) => {
    await signInAs("team-admin", logs);
    await page.getByRole("button", { name: "Edit central-cloudwatch" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("cw-main");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "cw-main", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Disable cw-main" }).click();
    await expect(page.getByRole("button", { name: "Enable cw-main" })).toBeVisible();
    await page.getByRole("button", { name: "Delete cw-main" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name: "cw-main", exact: true })).toHaveCount(0);
  });

  test("a viewer reads the destinations with every control disabled and sends no mutation", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", logs);
    await expect(page.getByRole("cell", { name: "central-cloudwatch", exact: true })).toBeVisible();
    for (const n of ["Add destination", "Edit central-cloudwatch", "Delete central-cloudwatch"])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("the API's 403 on a create is shown", async ({ page, signInAs }) => {
    await signInAs("team-admin", logs);
    await page.route(/\/log-destinations$/, async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "AccessDenied",
            message: "Requires logs:write",
            requestId: "req_x",
          }),
        });
      else await route.fallback();
    });
    await page.getByRole("button", { name: "Add destination" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("x");
    await d.getByLabel("Log group").fill("/a");
    await d.getByLabel("Region").fill("eu-west-1");
    await d.getByRole("button", { name: "Add destination" }).click();
    await expect(d).toContainText("You do not have access");
  });

  test("visual: T14 log delivery", async ({ page, signInAs }) => {
    await signInAs("team-admin", logs);
    await expect(page.getByText("HTTP 403 from the HEC endpoint")).toBeVisible();
    await expectVisual(page, "27-ta-log-delivery", { mask: ["time"] });
  });
});
