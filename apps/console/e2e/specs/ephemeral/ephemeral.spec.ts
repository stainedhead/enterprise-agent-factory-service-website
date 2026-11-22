import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { asEphemeral } from "../../helpers/ephemeralTeam.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

test.describe("P2 ephemeral team", () => {
  test("the budget step needs budget and expiry, shows the estimate and creates the team @smoke", async ({
    page,
    signInAs,
  }) => {
    const bodies: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/v1\/teams$/.test(r.url())) bodies.push(r.postData() ?? "");
    });
    await signInAs("svc-admin", "/teams/new");
    await page.getByLabel("Display name").fill("POC summarizer");
    await page.getByLabel("Slug").fill("poc-summarizer");
    await page.getByLabel("Kind").selectOption("ephemeral");
    await page.getByLabel("Tag: environment").selectOption("dev");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel(/Claude Sonnet/).check();
    await page.getByRole("button", { name: "Next" }).click();
    const next = page.getByRole("button", { name: "Next" });
    await expect(next).toHaveAttribute("aria-disabled", "true");
    await page.getByLabel("Lifetime budget (USD)").fill("2000.00");
    await page.getByLabel("Expires").fill(inDays(30));
    await page.getByLabel("Expected daily cost (USD)").fill("60.00");
    await expect(page.getByRole("region", { name: "Estimate" })).toContainText("34 days");
    await expectAxeClean(page);
    await next.click();
    await page.getByLabel("Admin email").fill("lead@example.test");
    await page.getByRole("button", { name: "Review" }).click();
    await expect(page.locator("code")).toContainText("--teardown-rule at_cap_or_expiry");
    await page.getByRole("button", { name: "Create team" }).click();
    await expect(page).toHaveURL(/\/teams$/);
    const sent = JSON.parse(bodies[0] ?? "{}");
    expect(sent).toMatchObject({
      kind: "ephemeral",
      maxBudgetUsd: "2000.00",
      teardownRule: "at_cap_or_expiry",
      budget: { amountUsd: "2000.00", period: "lifetime" },
    });
    expect(sent.expiresAt).toMatch(/T00:00:00Z$/);
  });

  test("visual: P2 ephemeral team budget step", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/teams/new");
    await page.getByLabel("Display name").fill("POC summarizer");
    await page.getByLabel("Slug").fill("poc-summarizer");
    await page.getByLabel("Kind").selectOption("ephemeral");
    await page.getByLabel("Tag: environment").selectOption("dev");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel(/Claude Sonnet/).check();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Lifetime budget (USD)").fill("2000.00");
    await page.getByLabel("Expires").fill(inDays(30));
    await page.getByLabel("Expected daily cost (USD)").fill("60.00");
    await expect(page.getByRole("region", { name: "Estimate" })).toContainText("34 days");
    await expectVisual(page, "14-admin-ephemeral-team", {
      mask: ["input[type=date]", "[aria-label=Estimate]"],
    });
  });

  test("an expiry beyond the service maximum is refused", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/teams/new");
    await page.getByLabel("Display name").fill("Long");
    await page.getByLabel("Slug").fill("long-one");
    await page.getByLabel("Kind").selectOption("ephemeral");
    await page.getByLabel("Tag: environment").selectOption("dev");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel(/Claude Sonnet/).check();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Lifetime budget (USD)").fill("100.00");
    await page.getByLabel("Expires").fill(inDays(400));
    await expect(page.getByRole("alert").filter({ hasText: "at most 90 days" })).toBeVisible();
  });

  test("T1 shows the ephemeral card with expiry and spend", async ({ page, signInAs }) => {
    await asEphemeral(page);
    await signInAs("team-admin", `/t/${TEAMS[0].id}`);
    const card = page.getByRole("region", { name: "Ephemeral team" });
    await expect(card).toContainText("days left");
    await expect(card).toContainText("whichever comes first");
    await expectAxeClean(page);
  });
});
