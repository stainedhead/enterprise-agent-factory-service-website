import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { control } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const page16 = `/t/${T}/collaboration`;

test.describe("T16 collaboration", () => {
  test("team-admin turns the REST API on and off @smoke", async ({ page, signInAs }) => {
    await signInAs("team-admin", page16);
    await expect(page.getByRole("region", { name: "Status" })).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("switch", { name: "REST API enabled" }).click();
    const d = page.getByRole("dialog");
    await expect(d).toContainText("reachable from the internet");
    await d.getByRole("button", { name: "Turn on" }).click();
    await expect(page.getByText("Takes effect within a minute")).toBeVisible();
    await expect(page.getByRole("switch", { name: "REST API enabled" })).toBeChecked();
    await page.getByRole("switch", { name: "REST API enabled" }).click();
    await expect(page.getByRole("switch", { name: "REST API enabled" })).not.toBeChecked();
    const puts = await requestsWhere((r) => r.operationId === "PutTeamCollaboration");
    expect(puts.length).toBe(2);
  });

  test("open paperclip is disabled with its reason", async ({ page, signInAs }) => {
    await control.collab({ phase: "Reconciling" });
    await signInAs("team-admin", page16);
    const open = page.getByRole("link", { name: "Open Paperclip" });
    await expect(open).toHaveAttribute("aria-disabled", "true");
    await open.focus();
    await expect(page.getByRole("tooltip")).toContainText("The collaboration agent is Reconciling");
  });

  test("a blocked surface explains why", async ({ page, signInAs }) => {
    await control.collab({ publicEndpoints: false });
    await signInAs("team-admin", page16);
    await expect(
      page.getByText("Public collaboration is off for the service").first(),
    ).toBeVisible();
  });

  test("empty state", async ({ page, signInAs }) => {
    await signInAs("svc-admin", `/t/${TEAMS[1].id}/collaboration`);
    await expect(page.getByText("This team has no collaboration agent")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create collaboration agent" })).toBeVisible();
    expect((await requestsWhere((r) => r.operationId === "ListCollaborationLinks")).length).toBe(0);
  });

  test("a suspended team refuses a change with its reason", async ({ page, signInAs }) => {
    await control.collab({ teamState: "suspended" });
    await signInAs("team-admin", page16);
    await page.getByRole("switch", { name: "Web UI enabled" }).click();
    await expect(page.getByText("The change was not saved")).toBeVisible();
  });

  test("visual: T16", async ({ page, signInAs }) => {
    await signInAs("team-admin", page16);
    await expect(page.getByRole("table", { name: "Worker agents" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Recent access" })).toBeVisible();
    await expectVisual(page, "30-team-collaboration", { mask: ["time"] });
  });

  test("a viewer and a collaborator see V3 and send no mutating request", async ({
    page,
    signInAs,
  }) => {
    for (const who of ["viewer", "collaborator"] as const) {
      await signInAs(who, page16);
      await expect(page.getByRole("heading", { name: /Collaboration/ }).first()).toBeVisible();
      await expect(page.getByRole("switch", { name: "Web UI enabled" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(page.getByRole("button", { name: "Connect", exact: true })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expectAxeClean(page);
      expect(await mutatingCount()).toBe(0);
    }
  });

  test("visual: V3", async ({ page, signInAs }) => {
    await signInAs("viewer", page16);
    await expect(page.getByRole("table", { name: "Worker agents" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Recent access" })).toBeVisible();
    await expectVisual(page, "30a-viewer-collaboration", { mask: ["time"] });
  });
});
