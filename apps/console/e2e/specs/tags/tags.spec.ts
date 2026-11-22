import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const t13 = `/t/${TEAMS[0].id}/tags`;

test.describe("S9 cost allocation tags", () => {
  test("lists system and service tags, and the teams missing a required value @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/cost-tags");
    await expect(page.getByRole("heading", { name: "Cost allocation tags" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "afs-team-id" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit afs-team-id" })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "environment", exact: true })).toBeVisible();
    const missing = page.getByRole("list", { name: "Teams missing a required value" });
    await expect(missing.getByRole("link", { name: "Payments" })).toHaveAttribute(
      "href",
      `/t/${TEAMS[0].id}/tags`,
    );
    await expectAxeClean(page);
  });

  test("adds, edits and removes a service tag", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/cost-tags");
    await page.getByRole("button", { name: "Add service tag" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Key").fill("cost-center");
    await d.getByLabel("Kind").selectOption("required");
    await d.getByLabel("Allowed values").fill("CC-100, CC-200");
    await d.getByLabel("Default value").fill("CC-100");
    await d.getByRole("button", { name: "Add tag" }).click();
    await expect(page.getByRole("cell", { name: "CC-100, CC-200" })).toBeVisible();
    await page.getByRole("button", { name: "Edit cost-center" }).click();
    await page.getByRole("dialog").getByLabel("Description").fill("Billing unit");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "Billing unit" })).toBeVisible();
    await page.getByRole("button", { name: "Remove cost-center" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("cell", { name: "Billing unit" })).toHaveCount(0);
  });

  test("refuses a reserved key before any request", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/cost-tags");
    await page.getByRole("button", { name: "Add service tag" }).click();
    await page.getByRole("dialog").getByLabel("Key").fill("aws:thing");
    await page.getByRole("dialog").getByRole("button", { name: "Add tag" }).click();
    await expect(page.getByRole("dialog")).toContainText("reserved");
    expect((await requestsWhere((r) => r.operationId === "PutServiceTag")).length).toBe(0);
  });

  test("groups spend by a tag key with (untagged) separate", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/cost-tags");
    await page.getByLabel("Group by").selectOption("tag:environment");
    await expect(page.getByRole("cell", { name: "(untagged)" })).toBeVisible();
  });

  test("the activation notice stays until acknowledged", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/cost-tags");
    await expect(page.getByText(/Activate the service and system tags/)).toBeVisible();
    await page.getByRole("button", { name: "Acknowledge" }).click();
    await expect(page.getByText(/Activate the service and system tags/)).toHaveCount(0);
    expect((await requestsWhere((r) => r.operationId === "PutSetting")).length).toBe(1);
  });

  test("team roles do not see the page", async ({ page, signInAs }) => {
    await signInAs("team-admin", "/cost-tags");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "ListServiceTags")).length).toBe(0);
  });

  test("visual: S9 cost allocation tags", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/cost-tags");
    await expect(page.getByRole("list", { name: "Teams missing a required value" })).toBeVisible();
    await expectVisual(page, "25-admin-cost-tags", { mask: ["time"] });
  });
});

test.describe("T13 team tags", () => {
  test("lists tags with their source and the keys dropped from Bedrock metadata @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", t13);
    await expect(page.getByRole("heading", { name: /^Tags/ })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "afs-team-id" })).toContainText("System");
    await expect(page.getByRole("row").filter({ hasText: "region" })).toContainText(
      "Service (fixed)",
    );
    await expect(page.getByText(/zz-extra-tag/)).toBeVisible();
    await expect(page.getByLabel("Value of afs-team-id")).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("a team-admin sets the required value and adds a tag", async ({ page, signInAs }) => {
    await signInAs("team-admin", t13);
    await page.getByLabel("Value of environment").fill("prod");
    await page.getByRole("button", { name: "Add tag" }).click();
    await page.getByLabel("New tag key").fill("owner");
    await page.getByLabel("Value of owner").fill("payments");
    await page.getByRole("button", { name: "Save tags" }).click();
    await expect(page.getByRole("row").filter({ hasText: "environment" })).toContainText("Team");
    const puts = await requestsWhere((r) => r.operationId === "PutTeamTags");
    expect(puts.length).toBe(1);
  });

  test("a reserved key is refused before any request", async ({ page, signInAs }) => {
    await signInAs("team-admin", t13);
    await page.getByRole("button", { name: "Add tag" }).click();
    await page.getByLabel("New tag key").fill("afs-x");
    await page.getByLabel("Value of afs-x").fill("1");
    await expect(page.getByRole("alert").filter({ hasText: "reserved" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "PutTeamTags")).length).toBe(0);
  });

  test("a viewer reads the tags with every control disabled and sends no mutating request", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", t13);
    await expect(page.getByRole("row").filter({ hasText: "cost-center" })).toBeVisible();
    for (const n of ["Add tag", "Save tags"])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: T13 team tags", async ({ page, signInAs }) => {
    await signInAs("team-admin", t13);
    await expect(page.getByText(/zz-extra-tag/)).toBeVisible();
    await expectVisual(page, "26-ta-team-tags", { mask: ["time"] });
  });
});
