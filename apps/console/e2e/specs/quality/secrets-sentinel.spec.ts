import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { SENTINEL_SECRET } from "../../fake-afs/fixtures/members.js";
import { SECRET_SENTINEL } from "../../fake-afs/fixtures/secrets.js";
import { openFrozen, spaGo } from "../../helpers/clock.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const ORIGINS = ["http://127.0.0.1:4173", ENDPOINTS.api, ENDPOINTS.idp];
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
