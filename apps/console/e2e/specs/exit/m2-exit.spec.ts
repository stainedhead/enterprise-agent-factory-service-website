import { AGENT_IDS } from "../../fake-afs/fixtures/agents.js";
import { TEAMS } from "../../fake-afs/fixtures/core.js";
import { SECRET_SENTINEL } from "../../fake-afs/fixtures/secrets.js";
import { expectAxeClean } from "../../helpers/axe.js";
import { ENDPOINTS } from "../../helpers/control.js";
import { mutatingCount } from "../../helpers/counters.js";
import { scanForSentinels } from "../../helpers/sentinel.js";
import { expect, test } from "../../helpers/test.js";

const T = TEAMS[0].id;
const ORIGINS = ["http://127.0.0.1:4173", ENDPOINTS.api, ENDPOINTS.idp];

test("M2 exit: a team viewer reads every M2 team screen and sends no mutating request", async ({
  page,
  signInAs,
}) => {
  await signInAs("viewer", `/t/${T}/agents/${AGENT_IDS[0]}`);
  // T2 and its panel: every action disabled
  await expect(page.getByRole("region", { name: /Agent reviewer/ })).toBeVisible();
  for (const n of ["Restart", "Pause", "Take snapshot", "Edit"])
    await expect(page.getByRole("button", { name: n, exact: true }).last()).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  await page.getByRole("tab", { name: "External systems" }).click();
  await page.getByRole("switch", { name: "GitHub" }).click({ force: true });
  await expectAxeClean(page);

  // T3 is reachable but Create is the API's decision; the page itself sends nothing until submitted
  await page.goto(`/t/${T}/secrets`);
  await expect(page.getByRole("button", { name: "Create secret" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await expect(page.getByRole("cell", { name: "Write-only" })).toHaveCount(0);

  await page.goto(`/t/${T}/config`);
  await expect(page.getByRole("button", { name: "Add value" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.goto(`/t/${T}/external-systems`);
  await expect(page.getByRole("button", { name: "Declare system" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await page.getByRole("switch", { name: "GitHub" }).click({ force: true });
  await expect(page.getByRole("switch", { name: "GitHub" })).toBeChecked();
  expect(await mutatingCount()).toBe(0);
});

test("M2 exit: a secret value is found nowhere after create, rotate and visiting every M2 screen", async ({
  page,
  signInAs,
  observed,
}) => {
  await signInAs("team-admin", `/t/${T}/secrets`);
  await page.getByRole("button", { name: "Create secret" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Name").fill("exit-secret");
  await d.getByLabel("Secret value").fill(SECRET_SENTINEL);
  await d.getByRole("button", { name: "Create secret" }).click();
  await expect(page.getByRole("row").filter({ hasText: "exit-secret" })).toBeVisible();
  await page.getByRole("button", { name: "Rotate exit-secret" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("New secret value").fill(SECRET_SENTINEL);
  await d.getByRole("button", { name: "Rotate" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const path of ["agents", "agents/new", "config", "external-systems"]) {
    await page.goto(`/t/${T}/${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(await scanForSentinels(page, [SECRET_SENTINEL], observed, ORIGINS)).toEqual([]);
});
