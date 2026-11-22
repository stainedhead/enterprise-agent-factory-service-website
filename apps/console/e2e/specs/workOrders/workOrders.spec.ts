import type { Page } from "@playwright/test";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { WORK_ORDER_IDS } from "../../fake-afs/fixtures/workOrders.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const detail = `/work-orders/${WORK_ORDER_IDS[0]}`;

async function fillBasics(page: Page, cve: string) {
  await page.getByLabel("CVE", { exact: true }).fill(cve);
  await page.getByLabel("Title").fill("Patch the thing");
  await page.getByLabel("SLA due").fill("2026-12-01T18:00");
  await page.getByLabel("Template").selectOption({ label: "cve-remediation" });
}

test.describe("P3 work orders", () => {
  test("a security operator lists work orders, most severe first, with team names and filters @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op");
    await expect(page).toHaveURL(/\/work-orders$/);
    const table = page.getByRole("table", { name: "Work orders" });
    await expect(table.getByRole("row")).toHaveCount(4);
    await expect(table.getByRole("row").nth(1)).toContainText("Patch openssl in payments services");
    await expect(table.getByText("Payments (payments)")).toBeVisible();
    await expect(table.getByText("Unassigned")).toBeVisible();
    await page.getByLabel("Status").selectOption("done");
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table).toContainText("Rotate leaked token");
    await page.getByLabel("Status").selectOption("");
    await page.getByLabel("Team").selectOption(TEAMS[0].id);
    await expect(table.getByRole("row")).toHaveCount(2);
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("a work order is found through the header search by CVE id", async ({ page, signInAs }) => {
    await signInAs("sec-op");
    const box = page.getByRole("combobox", { name: "Search" });
    await box.fill("CVE-2026-55");
    await expect(page.getByRole("group", { name: "Work orders" })).toContainText("CVE-2026-5555");
    await box.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/work-orders/${WORK_ORDER_IDS[1]}$`));
  });

  test("creates a work order: only enabled templates, owners, and the CLI command", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op", "/work-orders/new");
    await expect(page.getByLabel("Template").getByRole("option")).toHaveText([
      "Choose a template",
      "cve-remediation",
    ]);
    await fillBasics(page, "CVE-2026-7777");
    await page.getByLabel("Repository 1", { exact: true }).fill("github.com/acme/web");
    await page.getByLabel("Owning team for repository 1").selectOption(TEAMS[1].id);
    await page.getByLabel("Owning contact for repository 1").fill("ops@example.com");
    await expect(page.getByText(/afs work-orders create-work-order/)).toContainText(
      `--repos github.com/acme/web=${TEAMS[1].id},ops@example.com`,
    );
    await page.getByRole("button", { name: "Create work order" }).last().click();
    await expect(page).toHaveURL(/\/work-orders\/wo_/);
    await expect(page.getByRole("heading", { name: "Patch the thing" })).toBeVisible();
    const repos = page.getByRole("table", { name: "Repositories" });
    await expect(repos).toContainText("github.com/acme/web");
    await expect(repos).toContainText("(explicit)");
    expect((await requestsWhere((r) => r.operationId === "CreateWorkOrder")).length).toBe(1);
  });

  test("an ambiguous repository is pre-filled and an unowned one is highlighted after the API's 400", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op", "/work-orders/new");
    await fillBasics(page, "CVE-2026-8888");
    await page.getByLabel("Repository 1", { exact: true }).fill("github.com/acme/ambiguous");
    await page.getByRole("button", { name: "Add repository" }).click();
    await page.getByLabel("Repository 2", { exact: true }).fill("github.com/acme/orphan");
    await page.getByRole("button", { name: "Create work order" }).last().click();
    await expect(page.getByText("Some repositories need an owner")).toBeVisible();
    await expect(page.getByLabel("Owning team for repository 1")).toHaveValue(TEAMS[0].id);
    await expect(page.getByText(/Needs an owner/)).toBeVisible();
    // choosing an owner for the orphan lets the create through
    await page.getByLabel("Owning team for repository 2").selectOption(TEAMS[1].id);
    await page.getByRole("button", { name: "Create work order" }).last().click();
    await expect(page).toHaveURL(/\/work-orders\/wo_/);
  });

  test("a second work order for an open CVE shows the 409 with a link to the existing one", async ({
    page,
    signInAs,
  }) => {
    await signInAs("sec-op", "/work-orders/new");
    await fillBasics(page, "CVE-2026-1234");
    await page.getByLabel("Repository 1", { exact: true }).fill("github.com/acme/api");
    await page.getByRole("button", { name: "Create work order" }).last().click();
    await expect(page.getByText("A work order for this CVE is already open")).toBeVisible();
    await page.getByRole("link", { name: /Open Patch openssl/ }).click();
    await expect(page).toHaveURL(new RegExp(`${detail}$`));
  });

  test("a security operator cancels with a reason", async ({ page, signInAs }) => {
    await signInAs("sec-op", `/work-orders/${WORK_ORDER_IDS[1]}`);
    await page.getByRole("button", { name: "Cancel work order" }).click();
    const d = page.getByRole("dialog");
    await expect(d.getByRole("button", { name: "Cancel work order" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect((await requestsWhere((r) => r.operationId === "CancelWorkOrder")).length).toBe(0);
    await d.getByLabel(/Reason/).fill("Duplicate of another order");
    await d.getByRole("button", { name: "Cancel work order" }).click();
    await expect(page.getByText("Duplicate of another order")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel work order" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

test.describe("P6 work order detail for team callers", () => {
  test("a team admin of an owning team reads it with only their repositories and no changes", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", detail);
    await expect(
      page.getByRole("heading", { name: "Patch openssl in payments services" }),
    ).toBeVisible();
    const repos = page.getByRole("table", { name: "Repositories" });
    await expect(repos).toContainText("acme/payments-api");
    await expect(repos).not.toContainText("acme/ledger");
    await expect(page.getByRole("button", { name: "Cancel work order" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("a viewer is read-only too, and a work order with no link to their team is not found", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", detail);
    await expect(page.getByRole("button", { name: "Cancel work order" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.goto(`/work-orders/${WORK_ORDER_IDS[1]}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });

  test("the team overview links its work orders to the detail", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${TEAMS[0].id}`);
    await page.getByRole("link", { name: "Patch openssl in payments services" }).click();
    await expect(page).toHaveURL(new RegExp(`${detail}$`));
  });
});

test.describe("visual", () => {
  test("visual: P3 work orders", async ({ page, signInAs }) => {
    await signInAs("sec-op");
    await expect(page.getByRole("table", { name: "Work orders" }).getByRole("row")).toHaveCount(4);
    await expectVisual(page, "15-admin-work-orders", { mask: ["time"] });
  });
  test("visual: P6 work order detail", async ({ page, signInAs }) => {
    await signInAs("sec-op", detail);
    await expect(page.getByRole("table", { name: "Repositories" })).toContainText("acme/ledger");
    await expectVisual(page, "29-sec-work-order-detail", { mask: ["time"] });
  });
});
