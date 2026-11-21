import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "tools/**/*.test.ts"],
    exclude: ["test/browser/**", "node_modules/**"],
    setupFiles: ["./test/setup.ts"],
    coverage: { provider: "v8", include: ["src/core/**"], exclude: ["**/*.test.ts"] },
  },
});
