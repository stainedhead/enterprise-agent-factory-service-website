import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;

test.describe("orchestration on the team and service screens", () => {
  test("T1 tile shows the hostname and Open Paperclip AI", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}`);
    const tile = page.locator("section", {
      has: page.getByRole("heading", { name: "Orchestration" }),
    });
    await expect(tile.first()).toContainText("Paperclip AI");
    await expect(page.getByRole("link", { name: "Open Paperclip AI" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("T2 shows the orchestration agent apart from the workers", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/agents`);
    await expect(page.getByText("Orchestration", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage orchestration" })).toBeVisible();
    const t = page.getByRole("table", { name: "Agents" });
    await expect(t.getByRole("columnheader", { name: "Collaboration" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("T4 afs and paperclip rows are read-only", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/secrets`);
    const row = page.getByRole("row").filter({ hasText: "paperclip-better-auth-secret" });
    await expect(row).toContainText("Managed by AFS");
    await expect(row.getByRole("button", { name: /^Delete/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    const master = page.getByRole("row").filter({ hasText: "paperclip-github-connector" });
    await expect(master.getByRole("button", { name: /^Rotate/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await expectAxeClean(page);
    // a value is never requested
    expect((await requestsWhere((r) => /value/i.test(r.path ?? ""))).length).toBe(0);
  });

  test("the create form has no role step and shows the models section", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/agents/new`);
    await expect(page.getByRole("radio", { name: /Collaboration/ })).toHaveCount(0);
    await expect(page.getByRole("radiogroup", { name: /Models/ })).toBeVisible();
    await expectAxeClean(page);
  });

  test("S12 lists endpoints, filters by tool and downloads the CSV", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/orchestration");
    const t = page.getByRole("table", { name: "Orchestration endpoints" });
    await expect(t.getByText(TEAMS[0].slug).first()).toBeVisible();
    await expectAxeClean(page);
    await page.getByLabel("Tool").selectOption("buzz");
    await expect(t.getByText(TEAMS[0].slug)).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await requestsWhere((r) => r.operationId === "ListOrchestrationEndpoints")).length,
      )
      .toBeGreaterThan(1);
  });

  test("S12 is not reachable by a team role", async ({ page, signInAs }) => {
    await signInAs("team-admin", "/orchestration");
    await expect(page.getByRole("region", { name: "Orchestration endpoints" })).toHaveCount(0);
  });
});
