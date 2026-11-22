import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const T2 = TEAMS[1].id;

test.describe("collaboration on the team screens", () => {
  test("T1 tile shows the hostname and Open Paperclip", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}`);
    const tile = page.locator("section", {
      has: page.getByRole("heading", { name: "Collaboration" }),
    });
    await expect(tile.first()).toContainText("collab.example.com");
    await expect(page.getByRole("link", { name: "Open Paperclip" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("T2 shows the collaboration badge, the Paperclip column and the role filter", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T}/agents`);
    const t = page.getByRole("table", { name: "Agents" });
    await expect(t.getByText("Collaboration").first()).toBeVisible();
    await expect(t.getByRole("columnheader", { name: "Paperclip" })).toBeVisible();
    await page.getByLabel("Role").selectOption("collaboration");
    await expect(page).toHaveURL(/role=collaboration/);
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

  test("create the collaboration agent and land on T16", async ({ page, signInAs }) => {
    await signInAs("svc-admin", `/t/${T2}/agents/new?role=collaboration`);
    await expect(page.getByRole("radio", { name: "Collaboration (Paperclip)" })).toBeChecked();
    await expect(page.getByLabel("IAM identity")).toHaveValue("dedicated");
    await page.getByLabel("Name").fill("paperclip-hub");
    await page.getByRole("button", { name: "Create agent" }).click();
    await expect(page).toHaveURL(new RegExp(`/t/${T2}/collaboration`));
    const creates = await requestsWhere((r) => r.operationId === "CreateAgent");
    expect(creates.length).toBe(1);
  });

  test("a second collaboration agent is refused on the step", async ({ page, signInAs }) => {
    await signInAs("team-admin", `/t/${T}/agents/new`);
    await expect(page.getByText(/already has a collaboration agent/)).toBeVisible();
    await expect(page.getByRole("radio", { name: "Collaboration (Paperclip)" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
