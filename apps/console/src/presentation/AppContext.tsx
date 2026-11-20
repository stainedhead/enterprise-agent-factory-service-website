import { createContext, useContext } from "react";
import type { CheckServiceHealth } from "../application/usecases/CheckServiceHealth.js";

/** Use cases the presentation layer may call. Wired in main/. */
export interface UseCases {
  checkServiceHealth: CheckServiceHealth;
}

export const UseCasesContext = createContext<UseCases | null>(null);

export function useUseCases(): UseCases {
  const ctx = useContext(UseCasesContext);
  if (!ctx) throw new Error("UseCasesContext is not provided; wrap the app in main/");
  return ctx;
}
