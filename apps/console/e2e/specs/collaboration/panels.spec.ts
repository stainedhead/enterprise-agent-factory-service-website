import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { SECRET_SENTINEL } from "../../fake-afs/fixtures/secrets.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { requestsWhere } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const page16 = `/t/${T}/collaboration`;

test.describe("T16 panels", () => {
  test("the managed secrets and recent access match the fixture", async ({ page, signInAs }) => {
    await signInAs("team-admin", page16);
    const secrets = page.getByRole("table", { name: "Managed secrets" });
    await expect(secrets.getByText("paperclip-better-auth-secret")).toBeVisible();
    await expect(secrets.getByText("Managed by AFS").first()).toBeVisible();
    const access = page.getByRole("table", { name: "Recent access" });
    await expect(access.getByRole("row")).not.toHaveCount(1);
  });

  test("no secret value in any request", async ({ page, signInAs, observed }) => {
    await signInAs("team-admin", page16);
    await expect(page.getByRole("table", { name: "Managed secrets" })).toBeVisible();
    const origins = [
      `http://127.0.0.1:${process.env.E2E_WEB_PORT ?? 4173}`,
      ENDPOINTS.api,
      ENDPOINTS.idp,
    ];
    expect(await scanForSentinels(page, [SECRET_SENTINEL], observed, origins)).toEqual([]);
    const reads = await requestsWhere((r) => /secrets\/.*value/i.test(r.path ?? ""));
    expect(reads.length).toBe(0);
  });
});
