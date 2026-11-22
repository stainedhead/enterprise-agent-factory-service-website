import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { asEphemeral } from "../../helpers/ephemeralTeam.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const pools = `/t/${TEAMS[0].id}/pools`;

test.describe("P4 pools and stages", () => {
  test("lists stages in order with pools, worker counts, handoffs, storage and the shared role @smoke", async ({
    page,
    signInAs,
  }) => {
    await asEphemeral(page);
    await signInAs("team-admin", pools);
    const s1 = page.getByRole("region", { name: "Stage 1 · scan" });
    await expect(s1.getByText("dep-scanner")).toBeVisible();
    await expect(s1.getByText("pr-writer").first()).toBeVisible();
    const s2 = page.getByRole("region", { name: "Stage 2 · fix" });
    await expect(s2).toContainText("Scratch 40 GiB + shared EFS");
    await expect(s2).toContainText("afs-cve-remediation · 1 account ✓");
    await expect(s2).toContainText("15 reporting · 8 working · 7 idle · 1 impaired");
    await expect(page.getByRole("link", { name: "Pools & stages" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("scales a pool and shows the CLI command", async ({ page, signInAs }) => {
    await asEphemeral(page);
    await signInAs("team-admin", pools);
    await page
      .getByLabel(/^Select pool_/)
      .first()
      .check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Scale" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Workers").fill("20");
    await expect(d.locator("code")).toContainText("afs pools scale-pool");
    await d.getByRole("button", { name: "Scale" }).click();
    await expect(page.getByRole("region", { name: "Stage 1 · scan" })).toContainText("20");
    expect((await requestsWhere((r) => r.operationId === "ScalePool")).length).toBe(1);
  });

  test("pauses a pool, then resumes it, then deletes it with confirmation", async ({
    page,
    signInAs,
  }) => {
    await asEphemeral(page);
    await signInAs("team-admin", pools);
    await page
      .getByLabel(/^Select pool_/)
      .first()
      .check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Pause" }).click();
    await expect(page.getByText("Paused")).toBeVisible();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Resume" }).click();
    await expect(page.getByText("Paused")).toHaveCount(0);
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(
      page
        .getByRole("region", { name: "Stage 1 · scan" })
        .getByRole("cell", { name: "dep-scanner" }),
    ).toHaveCount(0);
  });

  test("creates a pool: refuses a taken name first, then creates and lists it", async ({
    page,
    signInAs,
  }) => {
    await asEphemeral(page);
    await signInAs("team-admin", `${pools}/new`);
    await page.getByLabel("Name").fill("dep-scanner");
    await expect(page.getByText(/already has this name/)).toBeVisible();
    await page.getByLabel("Name").fill("verifier");
    await page.getByRole("textbox", { name: "Workers" }).fill("3");
    await page.getByRole("combobox", { name: "Stage" }).selectOption({ label: "2. fix" });
    await expect(page.getByRole("complementary", { name: "Equivalent CLI" })).toContainText(
      "afs pools create-pool",
    );
    await expectAxeClean(page);
    await page.getByRole("button", { name: "Create pool" }).click();
    await expect(page).toHaveURL(/\/pools$/);
    await expect(page.getByRole("region", { name: "Stage 2 · fix" })).toContainText("verifier");
    const sent = await requestsWhere((r) => r.operationId === "CreatePool");
    expect(sent.length).toBe(1);
  });

  test("links a shared named role in an allowed account", async ({ page, signInAs }) => {
    await asEphemeral(page, {}, undefined);
    await signInAs("svc-admin", pools);
    await page
      .getByLabel(/^Select pool_/)
      .first()
      .check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Link shared role" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Role name").fill("swarm-reader");
    await d.getByLabel(/prod-payments/).check();
    await d.getByRole("button", { name: "Link role" }).click();
    await expect(page.getByRole("region", { name: "Shared role of dep-scanner" })).toContainText(
      "swarm-reader in 111122223333",
    );
  });

  test("a viewer sees pools read-only: every control disabled, no mutation sent", async ({
    page,
    signInAs,
  }) => {
    await asEphemeral(page);
    await signInAs("viewer", pools);
    await expect(page.getByRole("region", { name: "Stage 1 · scan" })).toBeVisible();
    for (const n of [
      "Add stage",
      "Create pool",
      /^Actions/,
      "Move stage scan",
      "Delete stage scan",
    ])
      await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await page.getByRole("button", { name: "Add stage" }).hover();
    await expect(page.getByText("Requires team-admin")).toBeVisible();
    await expectAxeClean(page);
    expect(await mutatingCount()).toBe(0);
  });

  test("a persistent team has no pools: no navigation item and the page is not found", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${TEAMS[0].id}`);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Pools & stages" })).toHaveCount(0);
    await page.goto(pools);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });

  test("the API's 403 on a scale is shown as access denied", async ({ page, signInAs }) => {
    await asEphemeral(page);
    await signInAs("team-admin", pools);
    await page.route(/:scale$/, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "AccessDenied",
          message: "Requires pools:write",
          requestId: "req_x",
        }),
      }),
    );
    await page
      .getByLabel(/^Select pool_/)
      .first()
      .check();
    await page.getByRole("button", { name: /^Actions/ }).click();
    await page.getByRole("menuitem", { name: "Scale" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Scale" }).click();
    await expect(page.getByRole("dialog")).toContainText("You do not have access");
  });

  test("visual: P4", async ({ page, signInAs }) => {
    await asEphemeral(page);
    await signInAs("team-admin", pools);
    await expect(page.getByRole("region", { name: "Stage 2 · fix" })).toContainText("15 reporting");
    await expectVisual(page, "27-ta-swarm-pools", { mask: ["time"] });
  });
});
