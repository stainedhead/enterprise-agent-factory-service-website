import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const agents = `/t/${T}/agents`;

test.describe("T2 agents", () => {
  test("lists agents with status, template and cost, and restarts one @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", agents);
    const row = page.getByRole("row").filter({ hasText: "reviewer" });
    await expect(row).toContainText("Ready");
    await expect(row).toContainText("$9,410.50");
    await expect(page.getByRole("row").filter({ hasText: "nightly" })).toContainText("Paused");
    await expect(page.getByRole("columnheader", { name: /replica/i })).toHaveCount(0);
    await expectAxeClean(page);
    await row.getByRole("link", { name: "reviewer" }).click();
    await page.getByRole("button", { name: "Restart" }).click();
    await expect(page.getByRole("region", { name: "Agent reviewer" })).toContainText("Reconciling");
    expect((await requestsWhere((r) => r.operationId === "RestartAgent")).length).toBe(1);
  });

  test("pauses after confirming, takes a snapshot and expands the volume", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `${agents}/${AGENT_IDS[0]}`);
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Pause" }).click();
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await page.getByRole("button", { name: "Take snapshot" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Take snapshot" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Expand volume" }).click();
    await page.getByLabel("New size (GiB)").fill("40");
    await expect(page.getByRole("dialog").getByRole("button", { name: "Expand" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await page.getByLabel("New size (GiB)").fill("80");
    await page.getByRole("dialog").getByRole("button", { name: "Expand" }).click();
    await expect(page.getByText("80 GiB")).toBeVisible();
  });

  test("a retired template is shown and Edit needs a new digest", async ({ page, signInAs }) => {
    await signInAs("team-admin", `${agents}/${AGENT_IDS[1]}`);
    await expect(page.getByRole("region", { name: "Agent triage" })).toContainText(
      "Template retired",
    );
    await page.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Save" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await dialog.getByLabel("Image").fill("registry.example.test/agents/coder:latest");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText(/pinned by digest/)).toBeVisible();
  });

  test("Logs and Revisions tabs", async ({ page, signInAs }) => {
    await signInAs("team-admin", `${agents}/${AGENT_IDS[0]}`);
    await page.getByRole("tab", { name: "Logs" }).click();
    await expect(page.getByText("central-cloudwatch")).toBeVisible();
    await page.getByRole("tab", { name: "Revisions" }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
    await expectAxeClean(page);
  });

  test("visual: T2", async ({ page, signInAs }) => {
    await signInAs("team-admin", `${agents}/${AGENT_IDS[0]}`);
    await expect(page.getByRole("region", { name: "Agent reviewer" })).toBeVisible();
    await expectVisual(page, "07-team-agents", { mask: ["time"] });
  });

  test("a viewer sees the panel with every action disabled and sends no mutation", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", `${agents}/${AGENT_IDS[0]}`);
    for (const name of ["Restart", "Pause", "Take snapshot", "Edit", "Create agent"])
      await expect(page.getByRole("button", { name })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Restart" }).click({ force: true });
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });
});
