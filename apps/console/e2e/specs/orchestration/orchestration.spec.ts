import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { control } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";
import { expectVisual } from "../../helpers/visual.js";

const T = TEAMS[0].id;
const page17 = `/t/${T}/orchestration`;

const editEndpoints = async (page: import("@playwright/test").Page) => {
  await page.getByRole("button", { name: /Actions/ }).click();
  await page.getByRole("menuitem", { name: "Edit endpoints" }).click();
  return page.getByRole("dialog");
};

test.describe("T17 orchestration", () => {
  test("team-admin changes the Web API to Private and saves @smoke", async ({ page, signInAs }) => {
    await control.collab({ limit: "private" });
    await signInAs("team-admin", page17);
    await expect(page.getByRole("region", { name: "Status" })).toBeVisible();
    await expectAxeClean(page);
    const d = await editEndpoints(page);
    await d
      .getByRole("radiogroup", { name: /Web API/ })
      .getByRole("radio", { name: "Private" })
      .click();
    await d.getByRole("button", { name: "Review" }).click();
    await expect(d).toContainText("--web-api-exposure private");
    await d.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Change not applied yet")).toBeVisible();
    const puts = await requestsWhere((r) => r.operationId === "PutTeamOrchestration");
    expect(puts.length).toBe(1);
  });

  test("a level above the team limit is visible and disabled with its reason", async ({
    page,
    signInAs,
  }) => {
    await control.collab({ limit: "private" });
    await signInAs("team-admin", page17);
    const d = await editEndpoints(page);
    const pub = d
      .getByRole("radiogroup", { name: /Web UI/ })
      .getByRole("radio", { name: "Public" });
    await expect(pub).toHaveAttribute("aria-disabled", "true");
  });

  test("Public asks for confirmation on the review step when the limit allows it", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", page17);
    const d = await editEndpoints(page);
    await d
      .getByRole("radiogroup", { name: /Web UI/ })
      .getByRole("radio", { name: "Public" })
      .click();
    await d.getByRole("button", { name: "Review" }).click();
    await expect(d).toContainText("reachable from the internet");
  });

  test("open the tool is disabled with its reason", async ({ page, signInAs }) => {
    await control.collab({ phase: "Reconciling" });
    await signInAs("team-admin", page17);
    const open = page.getByRole("link", { name: "Open Paperclip AI" });
    await expect(open).toHaveAttribute("aria-disabled", "true");
    await open.focus();
    await expect(page.getByRole("tooltip")).toContainText("Reconciling");
  });

  test("a lowered surface explains why", async ({ page, signInAs }) => {
    await control.collab({ publicEndpoints: false, limit: "public" });
    await signInAs("svc-admin", page17);
    const d = await editEndpoints(page);
    await d
      .getByRole("radiogroup", { name: /Web UI/ })
      .getByRole("radio", { name: "Public" })
      .click();
    await d.getByRole("button", { name: "Review" }).click();
    await d.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/Chosen: Public. In effect: Private./)).toBeVisible();
  });

  test("changing the tool to Buzz makes both surfaces N/A", async ({ page, signInAs }) => {
    await signInAs("svc-admin", page17);
    await page.getByRole("button", { name: /Actions/ }).click();
    await page.getByRole("menuitem", { name: "Change tool" }).click();
    const d = page.getByRole("dialog");
    await d.getByRole("radio", { name: /Buzz/ }).check();
    await d.getByLabel(/to confirm/).fill(TEAMS[0].slug);
    await d.getByRole("button", { name: "Change tool" }).click();
    await expect(page.getByRole("region", { name: "Endpoints" })).toContainText("N/A");
    const calls = await requestsWhere((r) => r.operationId === "ChangeCollaborationTool");
    expect(calls.length).toBe(1);
  });

  test("empty state while the team has no orchestration agent", async ({ page, signInAs }) => {
    await signInAs("svc-admin", `/t/${TEAMS[1].id}/orchestration`);
    await expect(page.getByText("Orchestration agent being created")).toBeVisible();
  });

  test("a suspended team refuses a change with its reason", async ({ page, signInAs }) => {
    await control.collab({ teamState: "suspended" });
    await signInAs("team-admin", page17);
    const d = await editEndpoints(page);
    await d
      .getByRole("radiogroup", { name: /Web API/ })
      .getByRole("radio", { name: "Private" })
      .click();
    await d.getByRole("button", { name: "Review" }).click();
    await d.getByRole("button", { name: "Save" }).click();
    await expect(d.getByText(/The change was not saved/i)).toBeVisible();
  });

  test("visual: T17", async ({ page, signInAs }) => {
    await signInAs("team-admin", page17);
    await expect(page.getByRole("table", { name: "Worker agents" })).toBeVisible();
    await expect(page.getByRole("table", { name: "Recent access" })).toBeVisible();
    await expectVisual(page, "37-team-orchestration", { mask: ["time"] });
  });

  test("visual: T18 agent configuration", async ({ page, signInAs }) => {
    await signInAs("team-admin", `${page17}/config`);
    await expect(page.getByText("Orchestration runtime")).toBeVisible();
    await expectVisual(page, "38-orchestration-agent-config", { mask: ["time"] });
  });

  test("a viewer and a collaborator see V4 and send no mutating request", async ({
    page,
    signInAs,
  }) => {
    for (const who of ["viewer", "collaborator"] as const) {
      await signInAs(who, page17);
      await expect(page.getByRole("heading", { name: /Read-only/ })).toBeVisible();
      await page.getByRole("button", { name: /Actions/ }).click();
      await expect(page.getByRole("menuitem", { name: "Edit endpoints" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await page.keyboard.press("Escape");
      await expectAxeClean(page);
      expect(await mutatingCount()).toBe(0);
    }
  });

  test("visual: V4", async ({ page, signInAs }) => {
    await signInAs("viewer", page17);
    await expect(page.getByRole("table", { name: "Worker agents" })).toBeVisible();
    await expectVisual(page, "43-viewer-orchestration", { mask: ["time"] });
  });

  test("visual: S12", async ({ page, signInAs }) => {
    await signInAs("svc-admin", "/orchestration");
    await expect(page.getByRole("table", { name: "Orchestration endpoints" })).toBeVisible();
    await expectVisual(page, "34-admin-orchestration", { mask: ["time"] });
  });
});
