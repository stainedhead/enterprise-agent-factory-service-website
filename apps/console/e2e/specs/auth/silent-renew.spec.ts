import { control, ENDPOINTS } from "../../helpers/control.js";
import { deployHeaders, recordCspViolations, serveWithDeployHeaders } from "../../helpers/csp.js";
import { expect, test } from "../../helpers/test.js";

// FR-001: an IdP that issues no refresh token makes the console renew in a hidden frame of its own
// origin. Under the deploy CSP the callback must be allowed to load in that frame (`frame-ancestors
// 'self'`, `frame-src 'self' <issuers>`), or the session expires once per token lifetime.
test.describe("silent renewal in a frame under the deploy headers (FR-001)", () => {
  let proxy: Awaited<ReturnType<typeof serveWithDeployHeaders>>;
  test.beforeAll(async () => {
    proxy = await serveWithDeployHeaders("http://127.0.0.1:4173");
  });
  test.afterAll(async () => {
    await proxy.stop();
  });

  test("renews through the frame with no session-expired dialog and no CSP violation", async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(90_000);
    // the policy under test is the real one, not a copy
    expect(deployHeaders()["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    const violations = await recordCspViolations(page);
    await page.route("**/config.json", (route) =>
      route.fulfill({
        json: {
          apiUrl: ENDPOINTS.api,
          environmentName: "e2e",
          redirectUri: `${proxy.origin}/auth/callback`,
          idleTimeoutMinutes: 60,
        },
      }),
    );
    // 65 s lifetime: the renewal is due 5 s after sign-in (exp - 60 s); no refresh token is issued
    await control.idp({ ttl: 65, refresh: false });
    const tokens: string[] = [];
    const silent: string[] = [];
    page.on("response", async (r) => {
      if (r.url() === `${ENDPOINTS.idp}/token`) {
        const b = (await r.json().catch(() => ({}))) as { access_token?: string };
        if (b.access_token) tokens.push(b.access_token);
      }
    });
    page.on("request", (r) => {
      if (r.url().startsWith(`${ENDPOINTS.idp}/authorize`) && r.url().includes("prompt=none"))
        silent.push(r.url());
    });
    await signInAs("team-admin", `${proxy.origin}/`);
    await expect.poll(() => tokens.length, { timeout: 40_000 }).toBe(2);
    expect(silent.length).toBeGreaterThan(0);
    expect(tokens[1]).not.toBe(tokens[0]);
    // the renewed session carries on: no dialog, the shell is still there, the frame is gone
    await page.waitForTimeout(2_000);
    await expect(page.getByRole("dialog", { name: "Your session has expired" })).toHaveCount(0);
    await expect(page.getByText("Your session has expired")).toHaveCount(0);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(violations).toEqual([]);
  });
});
