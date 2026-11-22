import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { SENTINEL_SECRET } from "../../fake-afs/fixtures/members.js";
import { SECRET_SENTINEL } from "../../fake-afs/fixtures/secrets.js";
import { openFrozen, spaGo } from "../../helpers/clock.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const ORIGINS = [
  `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? 4173}`,
  ENDPOINTS.api,
  ENDPOINTS.idp,
];
const CANCELLED = "afsk_CANCELLED_5b1e0c77d3a94f28";

test("M6-Q4: no secret path leaves a value in any cache, storage, URL, history, console, telemetry or the DOM", async ({
  page,
  signInAs,
  observed,
}) => {
  test.setTimeout(120_000);
  await openFrozen(page, signInAs, "svc-admin", `/t/${T}/secrets`);
  const sentinels = [SECRET_SENTINEL, SENTINEL_SECRET, CANCELLED];
  const clean = async (when: string) =>
    expect(await scanForSentinels(page, sentinels, observed, ORIGINS), when).toEqual([]);

  // a value typed and then cancelled is never sent and leaves nothing behind
  await page.getByRole("button", { name: "Create secret" }).click();
  await page.getByRole("dialog").getByLabel("Secret value").fill(CANCELLED);
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  await clean("after a cancelled create");

  // create a secret
  await page.getByRole("button", { name: "Create secret" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Name").fill("sweep-token");
  await d.getByLabel("Secret value").fill(SECRET_SENTINEL);
  await d.getByRole("button", { name: "Create secret" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await clean("after CreateSecret");

  // rotate it
  await page.getByRole("button", { name: "Rotate github-bot-key" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("New secret value").fill(SECRET_SENTINEL);
  await d.getByRole("button", { name: "Rotate" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await clean("after RotateSecret");

  // a team API key: the secret is shown once, then gone
  await spaGo(page, `/t/${T}/members/api-keys`);
  await page.getByRole("button", { name: "Create API key" }).click();
  await page.getByLabel("Name").fill("sweep-team-key");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByLabel("API key", { exact: true })).toHaveText(SENTINEL_SECRET);
  await page.getByRole("button", { name: "Done" }).click();
  await clean("after CreateApiKey");

  // a service API key
  await spaGo(page, "/settings/service-api-keys");
  await page.getByRole("button", { name: "Create service API key" }).click();
  await page.getByLabel("Name").fill("sweep-service-key");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByLabel("Service API key", { exact: true })).toHaveText(SENTINEL_SECRET);
  await page.getByRole("button", { name: "Done" }).click();
  await clean("after CreateServiceApiKey");

  // identity providers take the ARN of a secret, never a value
  await spaGo(page, "/settings/identity-providers");
  await page.getByRole("button", { name: "Add provider" }).click();
  d = page.getByRole("dialog");
  await expect(d.locator('input[type="password"]')).toHaveCount(0);
  await expect(d.getByLabel("Client secret ARN")).toBeVisible();
  await expect(d.getByLabel(/client secret(?! ARN)/i)).toHaveCount(0);
  await page.keyboard.press("Escape");

  // and the sentinels never travelled anywhere but the secret and key operations
  const writes = await requestsWhere((r) => r.mutating);
  for (const w of writes)
    if (
      !["CreateSecret", "RotateSecret", "CreateApiKey", "CreateServiceApiKey"].includes(
        w.operationId ?? "",
      )
    )
      expect(JSON.stringify(w), w.operationId).not.toContain(SECRET_SENTINEL);

  // navigating around afterwards still finds nothing
  for (const path of [`/t/${T}`, `/t/${T}/agents`, "/audit", `/t/${T}/history/audit`]) {
    await spaGo(page, path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  }
  await clean("after navigating away");
});

const arm = async (operationId: string, requiredPermission: string) => {
  const r = await fetch(`${ENDPOINTS.api}/__inject`, {
    method: "POST",
    body: JSON.stringify({ operationId, status: 403, times: 1, requiredPermission }),
  });
  if (!r.ok) throw new Error(`arming ${operationId}: ${r.status}`);
};

test("FR-002: a denied create and a denied rotate name the permission and leave no secret value anywhere", async ({
  page,
  signInAs,
  observed,
}) => {
  test.setTimeout(120_000);
  await openFrozen(page, signInAs, "svc-admin", `/t/${T}/secrets`);
  const DENIED = "DENIED-5d1c8e02-sentinel";
  const sentinels = [DENIED];
  const clean = async (when: string) =>
    expect(await scanForSentinels(page, sentinels, observed, ORIGINS), when).toEqual([]);

  // create: denied by the API (the permission was revoked after GetMe)
  await arm("CreateSecret", "secrets:write");
  await page.getByRole("button", { name: "Create secret" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Name").fill("denied-token");
  await d.getByLabel("Secret value").fill(DENIED);
  await d.getByRole("button", { name: "Create secret" }).click();
  await expect(d.getByText(/It requires/)).toContainText("secrets:write");
  await expect(d.getByText(/Request id:/)).toBeVisible();
  await expect(d.getByLabel("Secret value")).toHaveValue("");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await clean("after a denied CreateSecret");
  await d.getByRole("button", { name: "Cancel" }).click();

  // rotate
  await arm("RotateSecret", "secrets:write");
  await page.getByRole("button", { name: "Rotate github-bot-key" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("New secret value").fill(DENIED);
  await d.getByRole("button", { name: "Rotate" }).click();
  await expect(d.getByText(/It requires/)).toContainText("secrets:write");
  await expect(d.getByLabel("New secret value")).toHaveValue("");
  await clean("after a denied RotateSecret");
  await d.getByRole("button", { name: "Cancel" }).click();

  // the value was sent only to the two secret operations (and each was refused)
  const writes = await requestsWhere((r) => r.mutating);
  expect(writes.filter((w) => w.status === 403).map((w) => w.operationId)).toEqual([
    "CreateSecret",
    "RotateSecret",
  ]);
  await clean("after closing the dialogs");
});
