import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// The SDK suite that has no Node-only dependencies, run in real Chromium (WEB-US-4.3).
export default defineConfig({
  test: {
    include: ["src/core/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
