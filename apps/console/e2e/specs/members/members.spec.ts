import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { SENTINEL_SECRET } from "../../fake-afs/fixtures/members.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const members = `/t/${T}/members`;
const keys = `${members}/api-keys`;

test.describe("T6 members", () => {
  test("lists members, adds one and changes a role @smoke", async ({ page, signInAs }) => {
    await signInAs("team-admin", members);
    await expect(page.getByText("team.admin@example.test")).toBeVisible();
    await expect(page.getByText("payments-eng")).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Add member" }).click();
    await page.getByLabel("Email").fill("bo@example.test");
    await page.getByRole("dialog").getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("bo@example.test")).toBeVisible();
    await page.getByRole("button", { name: "Change role of bo@example.test" }).click();
    await page.getByRole("dialog").getByLabel("Role").selectOption("team_admin");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("row").filter({ hasText: "bo@example.test" })).toContainText(
      "Team admin",
    );
    const patches = await requestsWhere((r) => r.operationId === "UpdateMember");
    expect(patches.length).toBe(1);
  });

  test("removing a member asks first", async ({ page, signInAs }) => {
    await signInAs("team-admin", members);
    await page.getByRole("button", { name: "Remove payments-eng" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("payments-eng")).toHaveCount(0);
  });

  test("visual: T6", async ({ page, signInAs }) => {
    await signInAs("team-admin", members);
    await expect(page.getByText("payments-eng")).toBeVisible();
    await expectVisual(page, "11-team-members", { mask: ["time"] });
  });

  test("a viewer sees disabled controls, no API keys tab, and sends no mutating request", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", members);
    await expect(page.getByText("team.admin@example.test")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add member" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expect(page.getByRole("tab", { name: "API keys" })).toHaveCount(0);
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("a viewer opening the API keys path never reads the keys", async ({ page, signInAs }) => {
    await signInAs("viewer", keys);
    await expect(page.getByText(/not found/i).first()).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "ListApiKeys")).length).toBe(0);
  });
});

test.describe("T6 API keys", () => {
  test("creates a key, shows the secret once and leaves it nowhere afterwards", async ({
    page,
    signInAs,
    observed,
  }) => {
    await signInAs("team-admin", keys);
    await expect(page.getByText("ci-pipeline")).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Create API key" }).click();
    await page.getByLabel("Name").fill("deploy");
    await expect(page.getByRole("dialog").locator("code")).toContainText(
      "afs api-keys create-api-key",
    );
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByLabel("API key", { exact: true })).toHaveText(SENTINEL_SECRET);
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("deploy")).toBeVisible();
    const hits = await scanForSentinels(page, [SENTINEL_SECRET], observed, [
      "http://127.0.0.1:4173",
      ENDPOINTS.api,
      ENDPOINTS.idp,
    ]);
    expect(hits).toEqual([]);
  });

  test("a replayed create says the key cannot be shown again and Delete key removes it", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", keys);
    await page.getByRole("button", { name: "Create API key" }).click();
    await page.getByLabel("Name").fill("replay-me");
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByText(/cannot be shown again/)).toBeVisible();
    await page.getByRole("button", { name: "Delete key", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("replay-me")).toHaveCount(0);
  });
});
