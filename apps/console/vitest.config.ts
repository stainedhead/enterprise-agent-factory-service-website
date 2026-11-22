import react from "@vitejs/plugin-react";
import { defaultClientConditions } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["source", ...defaultClientConditions] },
  test: {
    environment: "happy-dom",
    include: [
      "src/**/*.test.{ts,tsx}",
      "deploy/**/*.test.ts",
      "tools/**/*.test.ts",
      "e2e/**/*.test.ts",
    ],
    setupFiles: ["./test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/application/**"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "src/application/ports/**"],
      thresholds: { lines: 90, branches: 90, functions: 90, statements: 90 },
    },
  },
});
