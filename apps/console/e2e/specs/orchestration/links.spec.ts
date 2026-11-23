import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const page17 = `/t/${T}/orchestration`;

test.describe("T17 connected agents", () => {
  test("connect two agents", async ({ page, signInAs }) => {
    await signInAs("team-admin", page17);
    const t = page.getByRole("table", { name: "Worker agents" });
    await expect(t.getByText("Not connected").first()).toBeVisible();
    const rows = t.getByRole("row").filter({ hasText: "Not connected" });
    const n = Math.min(2, await rows.count());
    for (let i = 0; i < n; i++) await rows.nth(i).getByRole("checkbox").check();
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText(`${n} agents updated`)).toBeVisible();
    const calls = await requestsWhere((r) => r.operationId === "ConnectAgentToCollaboration");
    expect(calls.length).toBe(n);
  });

  test("disconnect", async ({ page, signInAs }) => {
    await signInAs("team-admin", page17);
    const t = page.getByRole("table", { name: "Worker agents" });
    await t.getByRole("row").filter({ hasText: "linked" }).first().getByRole("checkbox").check();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
    await expect(page.getByText("1 agents updated")).toBeVisible();
    const calls = await requestsWhere((r) => r.operationId === "DisconnectAgentFromCollaboration");
    expect(calls.length).toBe(1);
  });
});
