// Composition root: the only place infrastructure adapters are constructed and wired to use cases.
import { AfsClient } from "@afs/sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CheckServiceHealth } from "../application/usecases/CheckServiceHealth.js";
import { SdkServiceHealth } from "../infrastructure/sdk/SdkServiceHealth.js";
import { App } from "../presentation/App.js";
import { type UseCases, UseCasesContext } from "../presentation/AppContext.js";

// Interim until M0-A1 (runtime config) and M0-H (shell) replace this file.
const config = (await (await fetch("/config.json", { cache: "no-store" })).json()) as {
  apiUrl: string;
};
const client = new AfsClient({ endpoint: config.apiUrl });
const useCases: UseCases = {
  checkServiceHealth: new CheckServiceHealth(new SdkServiceHealth(client)),
};

const root = document.getElementById("root");
if (!root) throw new Error("#root element missing");
createRoot(root).render(
  <StrictMode>
    <UseCasesContext.Provider value={useCases}>
      <App />
    </UseCasesContext.Provider>
  </StrictMode>,
);
