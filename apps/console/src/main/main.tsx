// Composition root: the only place infrastructure adapters are constructed and wired to use cases.
import { AfsClient } from "@afs/sdk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CheckServiceHealth } from "../application/usecases/CheckServiceHealth.js";
import { SdkServiceHealth } from "../infrastructure/sdk/SdkServiceHealth.js";
import { App } from "../presentation/App.js";
import { type UseCases, UseCasesContext } from "../presentation/AppContext.js";
import { loadConfig } from "./config.js";

const config = loadConfig(import.meta.env);
const client = new AfsClient({ endpoint: config.apiEndpoint });
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
