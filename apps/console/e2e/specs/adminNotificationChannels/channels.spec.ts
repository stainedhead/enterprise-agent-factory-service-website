import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const page0 = "/settings/notification-channels";
const cell = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("cell", { name, exact: true });

test.describe("S10 service notification channels", () => {
  test("lists the service channels with their delivery status @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", page0);
    await expect(cell(page, "work-order-alerts")).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "invalid_auth" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("adds an email channel and refuses a missing recipient before any request", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", page0);
    await page.getByRole("button", { name: "Add channel" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Name").fill("finance");
    await d.getByRole("button", { name: "Add channel" }).click();
    await expect(d).toContainText("Enter the Recipients");
    expect(
      (await requestsWhere((r) => r.operationId === "CreateServiceNotificationChannel")).length,
    ).toBe(0);
    await d.getByLabel("Recipients").fill("fin@example.test");
    await d.getByRole("button", { name: "Add channel" }).click();
    await expect(cell(page, "finance")).toBeVisible();
  });

  test("edits and deletes a channel", async ({ page, signInAs }) => {
    await signInAs("svc-admin", page0);
    await page.getByRole("button", { name: "Edit platform-slack" }).click();
    await page.getByRole("dialog").getByLabel("Name").fill("platform-chat");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(cell(page, "platform-chat")).toBeVisible();
    await page.getByRole("button", { name: "Delete platform-chat" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(cell(page, "platform-chat")).toHaveCount(0);
  });

  test("deleting the channel work orders name shows the API's 409", async ({ page, signInAs }) => {
    await signInAs("svc-admin", page0);
    await page.getByRole("button", { name: "Delete work-order-alerts" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("The channel is in use")).toBeVisible();
    await expect(page.getByText(/work_orders.notification_channel_id/)).toBeVisible();
    await expect(cell(page, "work-order-alerts")).toBeVisible();
  });

  test("team roles do not see the section", async ({ page, signInAs }) => {
    await signInAs("team-admin", page0);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(
      (await requestsWhere((r) => r.operationId === "ListServiceNotificationChannels")).length,
    ).toBe(0);
  });

  test("the API's 403 on a change is shown", async ({ page, signInAs }) => {
    await signInAs("svc-admin", page0);
    await page.route(/\/v1\/admin\/notification-channels\/[^/]+$/, (route) =>
      route.request().method() === "PATCH"
        ? route.fulfill({
            status: 403,
            contentType: "application/json",
            body: JSON.stringify({
              code: "AccessDenied",
              message: "Requires admin:settings",
              requestId: "req_x",
            }),
          })
        : route.fallback(),
    );
    await page.getByRole("button", { name: "Disable platform-slack" }).click();
    await expect(page.getByText("You do not have access")).toBeVisible();
  });

  test("visual: S10 notification channels", async ({ page, signInAs }) => {
    await signInAs("svc-admin", page0);
    await expect(cell(page, "work-order-alerts")).toBeVisible();
    await expectVisual(page, "29-admin-notification-channels", { mask: ["time"] });
  });
});
