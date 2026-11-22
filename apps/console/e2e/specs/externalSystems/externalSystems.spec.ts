import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const url = `/t/${T}/external-systems`;

test.describe("T9 external systems", () => {
  test("shows inherited state and Unmetered; a team switch is sent @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("cell", { name: "GitHub", exact: true })).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "Jira" })).toContainText(
      "Off at service level",
    );
    await expect(page.getByRole("switch", { name: "Jira" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("row").filter({ hasText: "OpenAI API" })).toContainText(
      "Unmetered",
    );
    await expectAxeClean(page);
    await page.getByRole("switch", { name: "GitHub" }).click();
    await expect(page.getByRole("row").filter({ hasText: "GitHub" })).toContainText(
      "Off at team level",
    );
    expect(
      (await requestsWhere((r) => r.operationId === "SetTeamExternalSystemState")).length,
    ).toBe(1);
  });

  test("declares, edits and deletes a team system", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await page.getByRole("button", { name: "Declare system" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Declare system" }).click();
    await expect(d.getByText("Enter a name")).toBeVisible();
    await d.getByLabel("Name").fill("Internal CI");
    await d.getByLabel("Slug").fill("internal-ci");
    await d.getByLabel("Owner").fill("ops");
    await d.getByLabel("Purpose").fill("builds");
    await d.getByLabel("Endpoints").fill("ci.example.com");
    await d.getByRole("button", { name: "Declare system" }).click();
    const row = page.getByRole("row").filter({ hasText: "Internal CI" });
    await expect(row).toContainText("Team-declared");
    await page.getByRole("button", { name: "Edit Internal CI" }).click();
    await page.getByRole("dialog").getByLabel("Owner").fill("platform");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Delete Internal CI" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name: /Internal CI/ })).toHaveCount(0);
  });

  test("viewers: switches and actions are disabled and nothing is sent", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", url);
    await expect(page.getByRole("cell", { name: "GitHub", exact: true })).toBeVisible();
    await page.getByRole("switch", { name: "GitHub" }).click({ force: true });
    await expect(page.getByRole("button", { name: "Declare system" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: T9", async ({ page, signInAs }) => {
    await signInAs("team-admin", url);
    await expect(page.getByRole("cell", { name: "GitHub", exact: true })).toBeVisible();
    await expectVisual(page, "20-team-external-systems", { mask: ["time"] });
  });
});

test.describe("T10 agent external systems tab", () => {
  test("switching a system off for the agent shows Off at agent level; the team switch stays on", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/agents`);
    await page.getByRole("link", { name: "reviewer" }).first().click();
    await page.getByRole("tab", { name: "External systems" }).click();
    await page.getByRole("switch", { name: "Slack" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Slack" })).toContainText(
      "Off at agent level",
    );
    expect(
      (await requestsWhere((r) => r.operationId === "SetAgentExternalSystemState")).length,
    ).toBe(1);
    await expectAxeClean(page);
    await page.goto(url);
    await expect(page.getByRole("switch", { name: "Slack" })).toBeChecked();
  });

  test("visual: T10", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/agents`);
    await page.getByRole("link", { name: "reviewer" }).first().click();
    await page.getByRole("tab", { name: "External systems" }).click();
    await expect(page.getByRole("cell", { name: "GitHub", exact: true })).toBeVisible();
    await expectVisual(page, "21-agent-external-systems", { mask: ["time"] });
  });
});
