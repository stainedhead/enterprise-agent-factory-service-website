import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const page5 = "/swarm-templates";
const SPEC = '{"stages":[{"name":"scan","position":1}],"pools":[{"name":"p","workers":2}]}';

test.describe("P5 swarm templates", () => {
  test("a service admin sees the templates and the spec of the selected one @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", page5);
    const table = page.getByRole("table", { name: "Swarm templates" });
    await expect(table.getByRole("row")).toHaveCount(3);
    await expect(table.getByRole("row", { name: /legacy-patcher/ })).toContainText("Disabled");
    await page
      .getByRole("radio", { name: /Select swt_/ })
      .first()
      .check();
    const card = page.getByRole("region", { name: /cve-remediation · version 1/ });
    await expect(card).toContainText("scan, fix");
    await expect(card).toContainText("github-token");
    await expectAxeClean(page);
  });

  test("creates a template (disabled), enables it, edits it, disables it and deletes it", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", page5);
    await page.getByRole("button", { name: "Create template" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("nightly-fix");
    await d.getByLabel("Spend cap (USD)").fill("250");
    await d.getByLabel("Spec").fill(SPEC);
    await expect(d.getByText(/afs swarm-templates create-swarm-template/)).toContainText(
      "--name nightly-fix",
    );
    await d.getByRole("button", { name: "Create template" }).click();
    const table = page.getByRole("table", { name: "Swarm templates" });
    await expect(table.getByRole("row", { name: /nightly-fix/ })).toContainText("Disabled");
    const row = table.getByRole("row", { name: /nightly-fix/ });

    await row.getByRole("radio").check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Enable" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enable" }).click();
    await expect(row).toContainText("Enabled");

    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page
      .getByRole("dialog")
      .getByLabel(/Time to live/)
      .fill("96");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(row).toContainText("96 h");
    await expect(row).toContainText("2");

    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Disable" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
    await expect(row).toContainText("Disabled");

    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(table.getByRole("row", { name: /nightly-fix/ })).toHaveCount(0);
  });

  test("a disabled template is not offered when creating a work order, an enabled new one is", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", page5);
    await page
      .getByRole("radio", { name: /Select swt_/ })
      .nth(1)
      .check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Enable" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Enable" }).click();
    await page.goto("/work-orders/new");
    await expect(page.getByLabel("Template").getByRole("option")).toHaveText([
      "Choose a template",
      "cve-remediation",
      "legacy-patcher",
    ]);
  });

  test("refuses an invalid name and spec before any request, and shows the API's refusal to delete a template in use", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", page5);
    await page.getByRole("button", { name: "Create template" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("Bad Name");
    await d.getByLabel("Spend cap (USD)").fill("10");
    await d.getByRole("button", { name: "Create template" }).click();
    await expect(d.getByText(/lower-case letters, digits and hyphens, starting/)).toBeVisible();
    await expect(d.getByText("Add at least one stage")).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "CreateSwarmTemplate")).length).toBe(0);
    await d.getByRole("button", { name: "Cancel" }).click();

    await page
      .getByRole("radio", { name: /Select swt_/ })
      .first()
      .check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(
      page.getByRole("dialog").getByText("An open work order uses this template"),
    ).toBeVisible();
  });

  test("a security operator reads the page with every change disabled and sends no mutating request (M6-T2)", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op", page5);
    await expect(page.getByRole("table", { name: "Swarm templates" }).getByRole("row")).toHaveCount(
      3,
    );
    for (const n of ["Create template", /^Actions/])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Create template" }).hover();
    await expect(page.getByText("Requires service admin")).toBeVisible();
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("team roles do not see the page", async ({ page, signInAs }) => {
    await signInAs("team-admin", page5);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "ListSwarmTemplates")).length).toBe(0);
  });

  test("visual: P5 swarm templates", async ({ page, signInAs }) => {
    await signInAs("svc-admin", page5);
    await expect(page.getByRole("table", { name: "Swarm templates" }).getByRole("row")).toHaveCount(
      3,
    );
    await expectVisual(page, "28-admin-swarm-templates", { mask: ["time"] });
  });
});
