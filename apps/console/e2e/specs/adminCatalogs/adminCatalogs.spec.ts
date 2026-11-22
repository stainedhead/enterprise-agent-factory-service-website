import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const digest = (c: string) => `sha256:${c.repeat(64)}`;

test.describe("S10 storage classes", () => {
  const url = "/settings/storage-classes";
  test("adds a class; one in use cannot be removed and the refusal lists the agents @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", url);
    await expect(page.getByRole("cell", { name: "gp3", exact: true }).first()).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Add storage class" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("fast");
    await d.getByLabel("Volume type").selectOption("io2");
    await d.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "fast", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete gp3" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alert")).toContainText("gp3 is in use");
    await expect(page.getByRole("alert")).toContainText("reviewer");
    await page.getByRole("button", { name: "Delete fast" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name: "fast", exact: true })).toHaveCount(0);
    expect((await requestsWhere((r) => r.operationId === "DeleteStorageClass")).length).toBe(2);
  });

  test("a team admin does not get S10", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("button", { name: "Add storage class" })).toHaveCount(0);
  });

  test("visual: S10 storage classes", async ({ page, signInAs }) => {
    await signInAs("svc-admin", url);
    await expect(page.getByRole("cell", { name: "gp3", exact: true }).first()).toBeVisible();
    await expectVisual(page, "22-settings-storage-classes", { mask: ["time"] });
  });
});

test.describe("S10 agent templates", () => {
  const url = "/settings/agent-templates";
  test("adds, disables and edits a template; one in use cannot be removed @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", url);
    await expect(page.getByRole("cell", { name: "coder", exact: true })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Add agent template" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("fresh");
    await d.getByLabel("Harness").fill("hermes");
    await d.getByLabel("Allowed digests").fill(`${digest("a")}, ${digest("b")}`);
    await d.getByLabel("Current digest").selectOption(digest("b"));
    await d.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name: "fresh", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Disable fresh" }).click();
    await expect(page.getByRole("row").filter({ hasText: "fresh" })).toContainText("Disabled");
    await page.getByRole("button", { name: "Delete coder" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("alert")).toContainText("Agents still use this template");
  });

  test("the Platform nav item opens it directly", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/");
    await page.getByRole("navigation").getByRole("link", { name: "Agent templates" }).click();
    await expect(page).toHaveURL(/\/settings\/agent-templates$/);
    await expect(page.getByRole("tab", { name: "Agent templates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("visual: S10 agent templates", async ({ page, signInAs }) => {
    await signInAs("svc-admin", url);
    await expect(page.getByRole("cell", { name: "coder", exact: true })).toBeVisible();
    await expectVisual(page, "23-settings-agent-templates", { mask: ["time"] });
  });
});
