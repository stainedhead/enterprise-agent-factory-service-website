import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const url = `/t/${TEAMS[0].id}/delivery/notifications`;

test.describe("T14 notifications", () => {
  test("lists channels with delivery status and a failed delivery's error @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("heading", { name: "Delivery" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "ops-slack", exact: true })).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: "HTTP 401 from the webhook" }),
    ).toBeVisible();
    await expectAxeClean(page);
  });

  test("Send test reports a delivered test and a failed one", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Send test to ops-slack" }).click();
    await expect(page.getByText("Test delivered")).toBeVisible();
    await page.getByRole("button", { name: "Send test to billing-webhook" }).click();
    await expect(page.getByText(/Test failed: HTTP 401/)).toBeVisible();
  });

  test("a pending test is polled until the channel reports it", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Send test to pager" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Sending test" })).toBeVisible();
    await expect(page.getByText("Test delivered")).toBeVisible({ timeout: 10_000 });
    expect(
      (await requestsWhere((r) => r.operationId === "GetNotificationChannel")).length,
    ).toBeGreaterThan(0);
  });

  test("creating needs a credential secret, then adds the channel", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Add channel" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("alerts-2");
    await d.getByLabel("Slack channel").fill("#alerts-2");
    await d.getByRole("button", { name: "Add channel" }).click();
    await expect(d).toContainText("Choose the secret");
    expect((await requestsWhere((r) => r.operationId === "CreateNotificationChannel")).length).toBe(
      0,
    );
    await d.getByLabel("Credential secret").selectOption({ index: 1 });
    await d.getByRole("button", { name: "Add channel" }).click();
    await expect(d).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "alerts-2", exact: true })).toBeVisible();
  });

  test("deleting a channel used by a report schedule lists the schedule first", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Delete ops-slack" }).click();
    const d = page.getByRole("dialog");
    await expect(d).toContainText("Weekly spend");
    await d.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name: "ops-slack", exact: true })).toHaveCount(0);
  });

  test("a viewer reads the channels, controls are disabled, and no mutating request is sent", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", url);
    await expect(page.getByRole("cell", { name: "ops-slack", exact: true })).toBeVisible();
    for (const n of ["Add channel", "Send test to ops-slack", "Edit ops-slack", "Delete ops-slack"])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: T14 notifications", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("cell", { name: "ops-slack", exact: true })).toBeVisible();
    await expectVisual(page, "25-team-notifications", { mask: ["time"] });
  });
});
