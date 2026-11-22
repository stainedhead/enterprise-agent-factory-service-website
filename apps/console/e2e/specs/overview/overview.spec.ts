import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;

test.describe("T1 team overview", () => {
  test("shows budget burn, agent health, activity and work orders and is axe-clean @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}`);
    await expect(page.getByRole("heading", { name: /^Payments/ })).toBeVisible();
    await expect(page.getByText(/\$4,100\.00 of \$5,000\.00 \(82%\)/)).toBeVisible();
    await expect(
      page.getByText("arn:aws:iam::000000000000:role/afs-payments-shared"),
    ).toBeVisible();
    await expect(page.getByText("Paused")).toBeVisible();
    await expect(page.getByText(/teams\.suspend/)).toBeVisible();
    await expect(page.getByText("Patch openssl in payments services")).toBeVisible();
    await expectAxeClean(page);
  });

  test("visual: T1", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}`);
    await expect(page.getByText("Patch openssl in payments services")).toBeVisible();
    await expectVisual(page, "06-team-overview", { mask: ["time"] });
  });

  test("suspending disables write controls but keeps Resume; the banner shows", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}`);
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Suspend" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Suspend" }).click();
    await expect(page.getByText(/suspended/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Create agent" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByRole("button", { name: /Actions/ }).click();
    await expect(page.getByRole("menuitem", { name: "Resume" })).toBeEnabled();
  });

  test("Models tab: a service admin edits the team's models, a team admin cannot", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", `/t/${T}?tab=models`);
    await expect(page.getByText("Claude Sonnet 4.5")).toBeVisible();
    await page.getByRole("button", { name: "Edit models" }).click();
    await page.getByRole("checkbox", { name: "Claude Haiku 4.5" }).check();
    await page.getByRole("button", { name: "Save models" }).click();
    await expect(page.getByRole("button", { name: "Edit models" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Claude Haiku 4.5" })).toBeVisible();
    const puts = await requestsWhere((r) => r.operationId === "PutTeamModels");
    expect(puts.length).toBe(1);
  });

  test("team admin sees Edit models disabled", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}?tab=models`);
    await expect(page.getByRole("button", { name: "Edit models" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

test.describe("V1 viewer overview", () => {
  test("is read-only, axe-clean and sends no mutating request", async ({ page, signInAs }) => {
    await signInAs("viewer", `/t/${T}`);
    await expect(page.getByText("Read-only access")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("button", { name: "Create agent" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: V1", async ({ page, signInAs }) => {
    await signInAs("viewer", `/t/${T}`);
    await expect(page.getByText("Read-only access")).toBeVisible();
    await expectVisual(page, "12-viewer-overview", { mask: ["time"] });
  });
});
