import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const reports = `/t/${TEAMS[0].id}/reports`;
const creates = () => requestsWhere((r) => r.operationId === "CreateReportSchedule");

test.describe("T11 report schedules", () => {
  test("schedules the report on a cadence to a team channel, and lists it @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", reports);
    await page.getByRole("button", { name: "Schedule report" }).click();
    const d = page.getByRole("dialog", { name: "Schedule report" });
    await d.getByLabel("Name").fill("Monthly cost");
    await d.getByLabel("Cadence").selectOption("monthly");
    await d.getByLabel("Channel").selectOption({ label: "ops-slack" });
    await d.getByRole("button", { name: "Schedule" }).click();
    await expect(page.getByText(/Scheduled\. See the Schedules tab/)).toBeVisible();
    await page.getByRole("tab", { name: "Schedules" }).click();
    await expect(page.getByRole("cell", { name: "Monthly cost", exact: true })).toBeVisible();
    expect((await creates()).length).toBe(1);
  });

  test("lists next run, last run and a failed run's error", async ({ page, signInAs }) => {
    await signInAs("team-admin", `${reports}?tab=schedules`);
    await expect(page.getByRole("cell", { name: "Weekly spend", exact: true })).toBeVisible();
    await expect(page.getByText("HTTP 401 from the webhook")).toBeVisible();
    await expectAxeClean(page);
  });

  test("pauses and deletes a schedule", async ({ page, signInAs }) => {
    await signInAs("team-admin", `${reports}?tab=schedules`);
    await page.getByRole("button", { name: "Pause Weekly spend" }).click();
    await expect(page.getByRole("button", { name: "Resume Weekly spend" })).toBeVisible();
    await page.getByRole("button", { name: "Delete Weekly spend" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name: "Weekly spend", exact: true })).toHaveCount(0);
  });

  test("a service-level channel is refused on the channel field", async ({ page, signInAs }) => {
    await signInAs("team-admin", reports);
    await page.route(/\/report-schedules$/, async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            code: "ValidationError",
            message: "Use one of the team's own channels",
            requestId: "req_x",
            details: {
              fields: [
                {
                  field: "channelId",
                  message: "Use one of the team's own channels",
                  reason: "invalid",
                },
              ],
            },
          }),
        });
      else await route.fallback();
    });
    await page.getByRole("button", { name: "Schedule report" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Channel").selectOption({ label: "ops-slack" });
    await d.getByRole("button", { name: "Schedule" }).click();
    await expect(d.getByText("Use one of the team's own channels")).toBeVisible();
  });

  test("a viewer reads schedules; Schedule report, pause and delete are disabled and nothing is sent", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", reports);
    await expect(page.getByRole("button", { name: "Schedule report" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByRole("tab", { name: "Schedules" }).click();
    for (const n of ["Pause Weekly spend", "Delete Weekly spend"])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
    expect((await creates()).length).toBe(0);
  });
});
