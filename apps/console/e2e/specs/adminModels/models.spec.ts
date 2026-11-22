import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const url = "/models";

test.describe("S4 models and pricing", () => {
  test("lists models and a pending proposal beside the old price @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", url);
    await expect(
      page.getByRole("cell", { name: "anthropic.claude-sonnet-4-5", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("cell", { name: "1.00 → 0.80" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("approving moves the proposal into the model's price history", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", url);
    await page.getByRole("button", { name: "Approve anthropic.claude-haiku-4" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Note (optional)").fill("matches the price list");
    await d.getByRole("button", { name: "Approve" }).click();
    await expect(page.getByText("No price changes are waiting.")).toBeVisible();
    const haiku = page.getByRole("row").filter({ hasText: "anthropic.claude-haiku-4" });
    await haiku.getByRole("radio").check();
    await expect(page.getByRole("cell", { name: "2026-12-01 00:00 UTC" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "svc-admin (approved)" })).toBeVisible();
    const posts = await requestsWhere((r) => r.operationId === "ApproveModelPriceProposal");
    expect(posts.length).toBe(1);
  });

  test("rejecting leaves prices as they were", async ({ page, signInAs }) => {
    await signInAs("svc-admin", url);
    await page.getByRole("button", { name: "Reject anthropic.claude-haiku-4" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();
    await expect(page.getByText("No price changes are waiting.")).toBeVisible();
    await expect(
      page.getByRole("row").filter({ hasText: "anthropic.claude-haiku-4" }),
    ).toContainText("1.00");
  });

  test("a team admin does not get the catalog and sends no mutation", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: S4", async ({ page, signInAs }) => {
    await signInAs("svc-admin", url);
    await page
      .getByRole("row")
      .filter({ hasText: "anthropic.claude-sonnet-4-5" })
      .getByRole("radio")
      .check();
    await expect(page.getByText(/price history/)).toBeVisible();
    await expectVisual(page, "04-admin-models", { mask: ["time"] });
  });
});
