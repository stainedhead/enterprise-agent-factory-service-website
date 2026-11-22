import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { openFrozen } from "../../helpers/clock.js";
import { mutatingCount } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const team = `/t/${TEAMS[0].id}/reports`;
const agent = `${team}/agents/${AGENT_IDS[0]}`;

test.describe("T11 team reports", () => {
  test("shows cost with its chart, table alternative and the API's note @smoke", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "team-admin", team);
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByText("Billed cost for the last day has not arrived yet.")).toBeVisible();
    await expect(page.getByText("$483.70", { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: /Daily cost/ })).toBeVisible();
    await page.getByText("Data table").click();
    await expectAxeClean(page);
  });

  test("activity shows utilization and the longest idle; traffic has no cost and flags unmetered", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "team-admin", `${team}?tab=activity`);
    await expect(page.getByText("Utilization", { exact: true })).toBeVisible();
    await expect(page.getByText("3 h 10 min").first()).toBeVisible();
    await page.getByRole("tab", { name: "External systems" }).click();
    await expect(page.getByText("Unmetered systems")).toBeVisible();
    await expect(page.getByText("Spend", { exact: true })).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("a viewer reads the reports and sends no mutating request", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "viewer", team);
    await expect(page.getByText("$483.70", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download CSV" })).toBeEnabled();
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: T11", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "team-admin", team);
    await expect(page.getByRole("group", { name: /Daily cost/ })).toBeVisible();
    await expectVisual(page, "23-team-reports", { mask: ["time"] });
  });
});

test.describe("T12 agent report", () => {
  test("shows the agent's usage by model", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "team-admin", agent);
    await expect(page.getByRole("heading", { name: `Report for ${AGENT_IDS[0]}` })).toBeVisible();
    await expect(page.getByText("$353.50", { exact: true })).toBeVisible();
    await expectAxeClean(page);
  });

  test("the agent panel has a Usage tab", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "team-admin", `/t/${TEAMS[0].id}/agents/${AGENT_IDS[0]}`);
    await page.getByRole("tab", { name: "Usage" }).click();
    await expect(page.getByText("$353.50", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the full report" })).toBeVisible();
  });

  test("visual: T12", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "team-admin", agent);
    await expect(page.getByText("$353.50", { exact: true })).toBeVisible();
    await expectVisual(page, "24-agent-report", { mask: ["time"] });
  });
});

test.describe("S8 service reports and reconciliation", () => {
  test("a service admin sees service cost and the reconciliation by status @smoke", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "svc-admin", "/reports");
    await expect(page.getByRole("heading", { name: "Service reports" })).toBeVisible();
    await expect(page.getByText("$483.70", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Reconciliation" }).click();
    await expect(page.getByRole("cell", { name: TEAMS[0].id })).toBeVisible();
    await expect(page.getByText("$27.10")).toBeVisible();
    await page.getByLabel("Status").selectOption("");
    await expect(page.getByRole("cell", { name: "Missing billing" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("a team viewer does not find S8 and sends no mutating request", async ({
    page,
    signInAs,
  }) => {
    await openFrozen(page, signInAs, "viewer", "/reports");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });

  test("visual: S8", async ({ page, signInAs }) => {
    await openFrozen(page, signInAs, "svc-admin", "/reports/reconciliation");
    await expect(page.getByRole("cell", { name: TEAMS[0].id })).toBeVisible();
    await expectVisual(page, "22-service-reports", { mask: ["time"] });
  });
});
