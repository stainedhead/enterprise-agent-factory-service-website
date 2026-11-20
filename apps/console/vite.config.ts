import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // "source" resolves workspace packages (for example @afs/sdk) to their TypeScript sources.
  resolve: { conditions: ["source", ...defaultClientConditions] },
  server: { port: 5173 },
});
