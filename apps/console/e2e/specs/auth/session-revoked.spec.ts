import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { control, ENDPOINTS } from "../../helpers/control.js";
import { requestsWhere } from "../../helpers/counters.js";
import { expect, test } from "../../helpers/test.js";

const T1 = TEAMS[0].id;

/**
 * SEAM (stream B, B-6): this spec needs stream C's merge: the fault hook `e2e/fake-afs/faults.ts` (armed
 * through `/__inject`) and the `onUnauthenticated` option of `createQueryClient`, which `main.tsx` wires to
 * `session.expire()` (see the SEAM comment there). The integrator sets this to `true` in the same change as
 * that wiring. Until then the specs are skipped, never silently green.
 */
const STREAM_C_MERGED = false;

/** Fails the next `times` calls of `operationId` with 401 (stream C's fault hook). */
const armUnauthenticated = async (operationId: string, times: number) => {
  const r = await fetch(`${ENDPOINTS.api}/__inject`, {
    method: "POST",
    body: JSON.stringify({ operationId, status: 401, times }),
  });
  if (!r.ok) throw new Error(`arming ${operationId}: ${r.status}`);
};

const count = async (operationId: string) =>
  (await requestsWhere((r) => r.operationId === operationId)).length;

// FR-003: an API 401 that survives the SDK's one refresh expires the session, whichever call it was.
test.describe("a revoked session (FR-003)", () => {
  test.skip(
    !STREAM_C_MERGED,
    "needs stream C (faults.ts and onUnauthenticated); see the SEAM note",
  );

  test("two 401s from ListAgents show the session-expired dialog on the same route, and the query stops asking", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T1}`);
    await expect(page).toHaveURL(new RegExp(`/t/${T1}$`));
    const renewalsBefore = await control.idp({});
    // the IdP still renews (refresh grant), the API still says 401: a disabled user, a changed audience
    await armUnauthenticated("ListAgents", 2);
    await page.getByRole("link", { name: "Agents", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Your session has expired" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/t/${T1}/agents$`));
    expect(await control.idp({})).toBeGreaterThan(renewalsBefore); // the SDK did try one refresh
    // no retry storm: the original call and the one retry after the refresh, then nothing
    expect(await count("ListAgents")).toBe(2);
    await page.waitForTimeout(3_000);
    expect(await count("ListAgents")).toBe(2);
    await expect(dialog).toBeVisible();
  });

  test("a 401 on a secret write expires the session and the secret input is empty", async ({
    page,
    signInAs,
  }) => {
    await signInAs("team-admin", `/t/${T1}/secrets`);
    await page.getByRole("button", { name: "Create secret" }).click();
    const form = page.getByRole("dialog", { name: "Create secret" });
    await form.getByLabel("Name").fill("revoked-token");
    await form.getByLabel("Secret value").fill("REVOKED-5d1c8e02-sentinel");
    await armUnauthenticated("CreateSecret", 2);
    await form.getByRole("button", { name: "Create secret" }).click();
    const dialog = page.getByRole("dialog", { name: "Your session has expired" });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/t/${T1}/secrets$`));
    // the secret never survives expiry, wherever it was typed
    for (const input of await page.locator('input[type="password"]').all())
      await expect(input).toHaveValue("");
    await expect(page.getByText("REVOKED-5d1c8e02-sentinel")).toHaveCount(0);
  });
});
