import { test as base, expect, type Page } from "@playwright/test";
import { control, ENDPOINTS } from "./control.js";
import { type Observed, observe } from "./sentinel.js";

export interface ConfigOverrides {
  idleTimeoutMinutes?: number;
  providersFallback?: unknown[];
  [k: string]: unknown;
}

interface Fixtures {
  /** Console config served at `/config.json`; tests override fields before navigating. */
  config: ConfigOverrides;
  observed: Observed;
  /** Signs in as a seeded user through the fake IdP and waits for the shell. */
  signInAs: (
    user: "svc-admin" | "team-admin" | "viewer" | "sec-op",
    path?: string,
  ) => Promise<void>;
}

export const test = base.extend<Fixtures>({
  config: [{}, { option: true }],
  observed: async ({ page }, use) => {
    await use(observe(page));
  },
  page: async ({ page, context, baseURL, config }, use) => {
    await control.reset();
    await context.route("**/config.json", (route) =>
      route.fulfill({
        json: {
          apiUrl: ENDPOINTS.api,
          environmentName: "e2e",
          redirectUri: `${baseURL}/auth/callback`,
          idleTimeoutMinutes: 60,
          ...config,
        },
      }),
    );
    await use(page);
  },
  signInAs: async ({ page }, use) => {
    await use(async (user, path = "/") => {
      await control.idp({ user });
      await page.goto(path);
      await page.getByRole("banner").waitFor();
    });
  },
});

export type { Page };
export { expect };
