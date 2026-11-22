import { FROZEN_NOW, spaGo } from "../../helpers/clock.js";
import { control, ENDPOINTS } from "../../helpers/control.js";
import { deployHeaders, recordCspViolations, serveWithDeployHeaders } from "../../helpers/csp.js";
import { expect, test } from "../../helpers/test.js";
import { POOL_ROUTES, SERVICE_ROUTES, TEAM_ROUTES } from "./routes.js";

test.describe("M6-Q6 content security policy", () => {
  let proxy: Awaited<ReturnType<typeof serveWithDeployHeaders>>;
  test.beforeAll(async () => {
    proxy = await serveWithDeployHeaders("http://127.0.0.1:4173");
  });
  test.afterAll(async () => {
    await proxy.stop();
  });

  test("the deploy policy is strict: no inline script, no unsafe-eval, framing by 'self' only", () => {
    const csp = deployHeaders()["Content-Security-Policy"] as string;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-(inline|eval)/);
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain(`frame-src 'self' ${ENDPOINTS.idp}`);
    expect(csp).toContain("object-src 'none'");
    expect(deployHeaders()["X-Content-Type-Options"]).toBe("nosniff");
  });

  test("every screen runs under the deploy headers without a CSP violation", async ({
    page,
    signInAs,
  }) => {
    test.setTimeout(240_000);
    const violations = await recordCspViolations(page);
    // the console is opened through the proxy, so its documents and assets carry the deploy headers
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
    await control.idp({ ttl: 365 * 86_400 });
    await signInAs("svc-admin", `${proxy.origin}/`);
    await page.clock.setFixedTime(new Date(FROZEN_NOW));
    // the document really carries the policy: a probe that the policy forbids is blocked
    const blocked = await page.evaluate(
      () =>
        new Promise<boolean>((resolve) => {
          document.addEventListener("securitypolicyviolation", () => resolve(true), { once: true });
          const s = document.createElement("script");
          s.textContent = "1";
          document.head.append(s);
          setTimeout(() => resolve(false), 1000);
        }),
    );
    expect(blocked, "an inline script is blocked, so the policy is in force").toBe(true);
    violations.length = 0;
    for (const path of [...SERVICE_ROUTES, ...TEAM_ROUTES, ...POOL_ROUTES]) {
      await spaGo(page, path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
    expect(violations).toEqual([]);
  });
});
