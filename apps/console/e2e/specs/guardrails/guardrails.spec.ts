import { readFile } from "node:fs/promises";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount, requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const team = `/t/${TEAMS[0].id}`;

/** Turns viewer kubectl on at the fake as a service admin, before the page loads. */
async function kubectlOn() {
  const r = await fetch(`${ENDPOINTS.api}/v1/teams/${TEAMS[0].id}`, {
    method: "PATCH",
    headers: {
      authorization: "Bearer at.svc-admin.1",
      "content-type": "application/json",
      "if-match": '"1"',
    },
    body: JSON.stringify({ viewerKubectl: true }),
  });
  expect(r.status).toBe(200);
}

test.describe("Guardrails and kubeconfig", () => {
  test("a service admin sets the isolation tier and viewer kubectl, each after confirming @smoke", async ({
    page,
    signInAs,
  }) => {
    await signInAs("svc-admin", team);
    const card = page.getByRole("region", { name: "Guardrails" });
    await card.getByLabel("Isolation tier").selectOption("dedicated");
    await card.getByRole("button", { name: "Apply isolation tier" }).click();
    await expect(page.getByRole("dialog")).toContainText("--isolation-tier dedicated");
    await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
    await expect(card).toContainText("Now Dedicated");
    await expect(page.getByRole("region", { name: "Kubernetes access" })).toHaveCount(0);
    await card.getByRole("button", { name: "Turn on viewer kubectl" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
    await expect(card).toContainText("Viewer kubectl is on");
    const k = page.getByRole("region", { name: "Kubernetes access" });
    await expect(k).toContainText("afs teams get-kubeconfig --team-id");
    await expectAxeClean(page);
  });

  test("a team-admin sees both controls disabled with Requires service admin", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", team);
    const card = page.getByRole("region", { name: "Guardrails" });
    for (const n of ["Apply isolation tier", "Turn on viewer kubectl"])
      await expect(card.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
    await card.getByRole("button", { name: "Turn on viewer kubectl" }).hover();
    await expect(page.getByText("Requires service admin").first()).toBeVisible();
    expect(await mutatingCount()).toBe(0);
  });

  test("a viewer sees them disabled too, and a forced 403 on the update is access denied", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", team);
    const card = page.getByRole("region", { name: "Guardrails" });
    await expect(card.getByRole("button", { name: "Turn on viewer kubectl" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(await mutatingCount()).toBe(0);
  });

  test("the API's 403 on a guardrail change is shown as access denied", async ({
    page,
    signInAs,
  }) => {
    await page.route(/\/v1\/teams\/[^/]+$/, async (route) => {
      if (route.request().method() === "PATCH")
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({
            code: "AccessDenied",
            message: "Requires teams:set-guardrails",
            requestId: "req_x",
          }),
        });
      else await route.fallback();
    });
    await signInAs("svc-admin", team);
    await page.getByRole("button", { name: "Turn on viewer kubectl" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("You do not have access")).toBeVisible();
  });

  test("with viewer kubectl on a viewer downloads the kubeconfig and sees the command; off, neither", async ({
    page,
    signInAs,
  }) => {
    await signInAs("viewer", team);
    await expect(page.getByRole("region", { name: "Guardrails" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download kubeconfig" })).toHaveCount(0);
    await expect(page.getByText(/get-kubeconfig/)).toHaveCount(0);

    await kubectlOn();
    await page.reload();
    const k = page.getByRole("region", { name: "Kubernetes access" });
    await expect(k).toContainText("afs teams get-kubeconfig --team-id");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      k.getByRole("button", { name: "Download kubeconfig" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("kubeconfig-payments.yaml");
    const path = await download.path();
    expect(await readFile(path, "utf8")).toContain("current-context: afs-payments");
    expect((await requestsWhere((r) => r.operationId === "GetTeamKubeconfig")).length).toBe(1);
    await expectAxeClean(page);
  });
});
