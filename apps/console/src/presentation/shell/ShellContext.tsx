import { createContext, useContext, useSyncExternalStore } from "react";
import type { AppError } from "../../application/errors.js";
import type { RuntimeConfig } from "../../application/ports/config.js";
import type { BuildSearchIndex } from "../../application/usecases/BuildSearchIndex.js";
import type { ContractNotice } from "../../application/usecases/ContractNotice.js";
import type { GetMe } from "../../application/usecases/GetMe.js";
import type { SignOut } from "../../application/usecases/session/SignOut.js";
import type { Me } from "../../domain/me.js";

/** What the shell may call; built in main/. */
export interface ShellServices {
  readonly config: Pick<RuntimeConfig, "environmentName">;
  readonly getMe: GetMe;
  readonly contractNotice: ContractNotice;
  readonly searchIndex: BuildSearchIndex;
  readonly signOut: SignOut;
}

export const ShellContext = createContext<ShellServices | null>(null);

export function useShell(): ShellServices {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("ShellContext is not provided; wrap the app in main/");
  return ctx;
}

const MeContext = createContext<Me | null>(null);
export const MeProvider = MeContext.Provider;

/** The caller; only valid below the `MeGate`. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe outside the MeGate");
  return me;
}

/** The latest `Me` held by the use case (changes after a refresh). */
export function useCurrentMe(getMe: GetMe): Me | undefined {
  return useSyncExternalStore(
    (cb) => getMe.onChange(cb),
    () => getMe.current,
  );
}

export interface AccessDeniedValue {
  readonly error: AppError | undefined;
  report(e: AppError): void;
  dismiss(): void;
}
export const AccessDeniedContext = createContext<AccessDeniedValue>({
  error: undefined,
  report: () => {},
  dismiss: () => {},
});
export const useAccessDenied = () => useContext(AccessDeniedContext);
