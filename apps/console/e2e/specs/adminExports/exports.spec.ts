import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const bundle = (teams: string[]) => ({
  name: "bundle.json",
  mimeType: "application/json",
  buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, teams: teams.map((slug) => ({ slug })) })),
});

test.describe("S11 export and import", () => {
  test("lists past exports with size and checksum, a download link and an expired one @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/export-import");
    await expect(page.getByRole("heading", { name: "Export and import" })).toBeVisible();
    await expect(page.getByText(/secret values are never exported/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Download export/ })).toHaveCount(1);
    await expect(page.getByRole("cell", { name: "Expired" })).toBeVisible();
    await expect(page.getByText("471.0 KB")).toBeVisible();
    await expectAxeClean(page);
  });

  test("creates an export that is polled until it can be downloaded", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/export-import");
    await page.getByRole("button", { name: "Create export" }).click();
    await expect(page.getByText(/Preparing the bundle/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Download export/ })).toHaveCount(2, {
      timeout: 15000,
    });
    expect((await requestsWhere((r) => r.operationId === "CreateExport")).length).toBe(1);
  });

  test("a dry run shows the plan, and Apply needs a dry run of the same inputs and a confirmation", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/export-import");
    await page.getByLabel("Bundle file").setInputFiles(bundle(["payments", "bad-team"]));
    const apply = page.getByRole("button", { name: "Apply" });
    await expect(apply).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Dry run" }).click();
    await expect(page.getByText("Unknown model in the bundle")).toBeVisible();
    await expect(page.getByRole("cell", { name: /agents \+1/ }).first()).toBeVisible();
    await expect(apply).not.toHaveAttribute("aria-disabled", "true");
    await page.getByLabel("Account map").fill("111122223333=444455556666");
    await expect(apply).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Dry run" }).click();
    await expect(apply).not.toHaveAttribute("aria-disabled", "true");
    await apply.click();
    await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
    await expect(page.getByRole("table", { name: "Applied" })).toBeVisible();
    const imports = await requestsWhere((r) => r.operationId === "CreateImport");
    expect(imports.map((r) => new URLSearchParams(r.query).get("dryRun"))).toEqual([
      "true",
      "true",
      "false",
    ]);
  });

  test("refuses a malformed bundle before any request", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/export-import");
    await page.getByLabel("Bundle file").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("not json"),
    });
    await expect(page.getByText(/not valid JSON/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Dry run" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect((await requestsWhere((r) => r.operationId === "CreateImport")).length).toBe(0);
  });

  test("team roles do not see the page", async ({ page, signInAs }) => {
    await signInAs("team-admin", "/export-import");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "ListExports")).length).toBe(0);
  });

  test("the API's 403 on an import is shown", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/export-import");
    await page.route(/\/v1\/imports/, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "AccessDenied",
          message: "Requires admin:export",
          requestId: "req_x",
        }),
      }),
    );
    await page.getByLabel("Bundle file").setInputFiles(bundle(["payments"]));
    await page.getByRole("button", { name: "Dry run" }).click();
    await expect(page.getByText("You do not have access")).toBeVisible();
  });

  test("visual: S11 export and import", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/export-import");
    await expect(page.getByRole("cell", { name: "Expired" })).toBeVisible();
    await expectVisual(page, "28-admin-export-import", { mask: ["time"] });
  });
});
