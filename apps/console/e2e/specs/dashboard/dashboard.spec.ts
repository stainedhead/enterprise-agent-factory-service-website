import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

test.describe("S1 service dashboard", () => {
  test("shows counts, spend, health, top spenders and teams needing attention @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", "/");
    await expect(page.getByRole("heading", { name: /Service dashboard/ })).toBeVisible();
    await expect(page.getByText(/2 active, 0 suspended, 0 ephemeral/)).toBeVisible();
    await expect(page.getByText(/of \$13,000\.00 in budgets/)).toBeVisible();
    await expect(page.getByText("Healthy")).toBeVisible();
    const top = page.getByRole("region", { name: "Top spenders this month" });
    await expect(top.getByRole("link", { name: "Platform" })).toHaveAttribute(
      "href",
      `/t/${TEAMS[1].id}`,
    );
    const attention = page.getByRole("region", { name: "Teams needing attention" });
    await expect(attention.getByRole("row").filter({ hasText: "Platform" })).toContainText(
      "81% of budget used",
    );
    await expect(attention.getByRole("row").filter({ hasText: "Payments" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Agents" })).toContainText("0 degraded");
    await expectAxeClean(page);
  });

  test("warns about variance and pending proposals with links", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/");
    await expect(page.getByRole("link", { name: "Review reconciliation" })).toHaveAttribute(
      "href",
      "/reports/reconciliation",
    );
    await expect(page.getByRole("link", { name: "Review prices" })).toHaveAttribute(
      "href",
      "/models",
    );
  });

  test("each widget reads once per load, not in a loop", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/");
    await expect(page.getByText("Healthy")).toBeVisible();
    await expect(page.getByText(/in budgets/)).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "ListTeams")).length).toBeLessThan(3);
    expect((await requestsWhere((r) => r.operationId === "GetServiceReport")).length).toBeLessThan(
      3,
    );
  });

  test("visual: S1", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/");
    await expect(page.getByText("Healthy")).toBeVisible();
    await expect(page.getByText(/in budgets/)).toBeVisible();
    await expectVisual(page, "01-admin-dashboard", { mask: ["time"] });
  });
});
