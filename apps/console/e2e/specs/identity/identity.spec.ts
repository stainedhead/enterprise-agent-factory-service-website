import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const tab = `/t/${TEAMS[0].id}/agents/${AGENT_IDS[1]}?tab=secrets-identity`;
const t8 = `/t/${TEAMS[0].id}/identities`;

test.describe("T8 agent AWS access", () => {
  test("shows the dedicated role, its links and their status @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", tab);
    await expect(page.getByText("Dedicated role for this agent")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove prod-payments" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("adds a cross-account role, then copies its trust policy", async ({ page, signInAs }) => {
    await signInAs("team-admin", tab);
    await page.getByRole("button", { name: "Add cross-account role" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Profile name").fill("prod-deployer");
    await d
      .getByLabel("Role ARN in that account")
      .fill("arn:aws:iam::111122223333:role/afs/deployer");
    await d.getByRole("button", { name: "Add role" }).click();
    const t = page.getByRole("dialog", { name: "Trust policy for the target role" });
    await expect(t.getByLabel("Trust policy")).toContainText("sts:ExternalId");
    await expect(t.getByRole("button", { name: "Copy trust policy" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "CreateAgentRoleLink")).length).toBe(1);
  });

  test("Verify now moves Pending trust to Verified", async ({ page, signInAs }) => {
    await signInAs("team-admin", tab);
    await page.getByRole("button", { name: "Verify now" }).click();
    await expect(page.getByText("Pending trust")).toHaveCount(0, { timeout: 15000 });
    expect((await requestsWhere((r) => r.operationId === "VerifyAgentRoleLink")).length).toBe(2);
  });

  test("a failing verification shows its reason", async ({ page, signInAs }) => {
    await signInAs("team-admin", tab);
    await page.getByRole("button", { name: "Add cross-account role" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Profile name").fill("blocked-one");
    await d.getByLabel("Role ARN in that account").fill("arn:aws:iam::111122223333:role/blocked");
    await d.getByRole("button", { name: "Add role" }).click();
    await page
      .getByRole("dialog", { name: "Trust policy for the target role" })
      .getByRole("button", { name: "Close" })
      .first()
      .click();
    await page.getByRole("button", { name: "Verify now" }).click();
    await expect(page.getByText(/does not trust this agent/)).toBeVisible({ timeout: 15000 });
  });

  test("removes a link after confirming", async ({ page, signInAs }) => {
    await signInAs("team-admin", tab);
    await page.getByRole("button", { name: "Remove prod-payments" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Remove prod-payments" })).toHaveCount(0);
  });

  test("the team view links each agent to its tab", async ({ page, signInAs }) => {
    await signInAs("team-admin", t8);
    await expect(page.getByRole("heading", { name: "Agent identities" })).toBeVisible();
    await page.getByRole("link", { name: "Open triage" }).click();
    await expect(page).toHaveURL(/tab=secrets-identity/);
    await expect(page.getByText("Dedicated role for this agent")).toBeVisible();
  });

  test("the API's 403 on a filter edit is shown", async ({ page, signInAs }) => {
    await signInAs("svc-admin", t8);
    await page.route(/\/v1\/teams\/[^/]+$/, async (route) => {
      if (route.request().method() === "PATCH" || route.request().method() === "PUT")
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "AccessDenied",
            message: "Requires teams:write",
            requestId: "req_x",
          }),
        });
      else await route.fallback();
    });
    const f = page.getByLabel("Account filter");
    await f.fill("*");
    await page.getByRole("button", { name: "Save filter" }).click();
    await expect(page.getByText("You do not have access")).toBeVisible();
  });

  test("a viewer reads everything with every change disabled and sends no mutation", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", tab);
    await expect(page.getByRole("button", { name: "Remove prod-payments" })).toBeVisible();
    for (const n of ["Verify now", "Add cross-account role", "Remove prod-payments"])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: agent AWS access", async ({ page, signInAs }) => {
    await signInAs("team-admin", tab);
    await expect(page.getByRole("button", { name: "Remove prod-payments" })).toBeVisible();
    await expectVisual(page, "17-ta-agent-aws-access", { mask: ["time"] });
  });
});
