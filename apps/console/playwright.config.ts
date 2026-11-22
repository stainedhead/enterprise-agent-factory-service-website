import { defineConfig, devices } from "@playwright/test";

const API_PORT = Number(process.env.FAKE_AFS_PORT ?? 4400);
const IDP_PORT = Number(process.env.FAKE_IDP_PORT ?? 4401);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4173);

// Where a browser that Playwright did not install itself lives (sandboxes); unset in CI.
const executablePath = process.env.PW_CHROMIUM_PATH;
// Device scale factor 2: the mockups are 2880 x 1800 (WD-11). Presets set their own, so this goes last.
const scale = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const chromium = {
  ...devices["Desktop Chrome"],
  ...scale,
  ...(executablePath && { launchOptions: { executablePath } }),
};

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: false, // one fake API and one fake IdP serve every test; each test resets them
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "off",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
  projects: [
    { name: "chromium", use: chromium },
    // Smoke only on the other engines: specs tagged @smoke.
    { name: "firefox", use: { ...devices["Desktop Firefox"], ...scale }, grep: /@smoke/ },
    { name: "webkit", use: { ...devices["Desktop Safari"], ...scale }, grep: /@smoke/ },
    // Opt-in run against the platform's dev environment (CQ-7); never part of the gate.
    {
      name: "dev",
      use: chromium,
      testDir: "./e2e/dev",
      testMatch: process.env.E2E_DEV ? /.*\.spec\.ts/ : /^$/,
    },
  ],
  webServer: [
    {
      command: "bun e2e/fake-afs/serve.ts",
      url: `http://127.0.0.1:${API_PORT}/healthz`,
      env: { FAKE_AFS_PORT: String(API_PORT), FAKE_IDP_PORT: String(IDP_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // The e2e build compiles the test-only debug hook; the artefact is otherwise the production build.
      command: `bunx vite build --mode e2e --outDir dist-e2e && bunx vite preview --mode e2e --outDir dist-e2e --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
