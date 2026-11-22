import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

// One static build is promoted unchanged across environments (D43): no per-environment VITE_* values;
// the runtime /config.json carries everything environment-specific.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // "source" resolves workspace packages (for example @afs/sdk) to their TypeScript sources.
  resolve: { conditions: ["source", ...defaultClientConditions] },
  // Compiled in only for `vite build --mode e2e`: the test-only debug hook (cache scanning for sentinels).
  define: {
    __AFS_E2E__: JSON.stringify(mode === "e2e"),
    // Reported with telemetry so a regression can be tied to a build (M1-Y1).
    __AFS_BUILD__: JSON.stringify(process.env.AFS_BUILD ?? "dev"),
  },
  css: { modules: { generateScopedName: "[name]__[local]__[hash:base64:5]" } },
  build: {
    // Last two majors of Chrome, Edge, Firefox and Safari (NFR-3).
    target: ["chrome130", "edge130", "firefox130", "safari18"],
    // Hashed asset names, no inline script: the CSP is script-src 'self' (FR-037).
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: { port: 5173 },
}));
