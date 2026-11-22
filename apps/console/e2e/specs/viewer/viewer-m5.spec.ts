import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount } from "../../helpers/counters.js";
import { asEphemeral } from "../../helpers/ephemeralTeam.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;

test("a team viewer reads pools and the kubeconfig card, every change is disabled, and no mutating request is sent @smoke", async ({
  page,
  signInAs,
}) => {
  const r = await fetch(`${ENDPOINTS.api}/v1/teams/${T}`, {
    method: "PATCH",
    headers: {
      authorization: "Bearer at.svc-admin.1",
      "content-type": "application/json",
      "if-match": '"1"',
    },
    body: JSON.stringify({ viewerKubectl: true }),
  });
  expect(r.status).toBe(200);
  const before = await mutatingCount();

  // T1: the kubeconfig card is a read; the guardrail controls are disabled
  await signInAs("viewer", `/t/${T}`);
  await expect(page.getByRole("region", { name: "Kubernetes access" })).toBeVisible();
  for (const n of ["Apply isolation tier", "Turn off viewer kubectl"])
    await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
  await expectAxeClean(page);

  // P4: pools and stages, read-only (an ephemeral team)
  await asEphemeral(page);
  await page.goto(`/t/${T}/pools`);
  await expect(page.getByRole("region", { name: "Stage 1 · scan" })).toBeVisible();
  for (const n of ["Add stage", "Create pool", "Delete stage scan"])
    await expect(page.getByRole("button", { name: n })).toHaveAttribute("aria-disabled", "true");
  await expectAxeClean(page);

  expect(await mutatingCount()).toBe(before);
});
