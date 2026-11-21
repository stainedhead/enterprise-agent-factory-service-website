import { createContext, useContext, useSyncExternalStore } from "react";
import type { RuntimeConfig } from "../../application/ports/config.js";
import type { PreferencesPort } from "../../application/ports/preferences.js";
import type {
  BeginSignIn,
  CompleteSignIn,
} from "../../application/usecases/session/CompleteSignIn.js";
import type { DraftStore } from "../../application/usecases/session/DraftStore.js";
import type { ListProviders } from "../../application/usecases/session/ListProviders.js";
import type { ReAuthenticate } from "../../application/usecases/session/ReAuthenticate.js";
import type { Session, SessionState } from "../../application/usecases/session/Session.js";
import type { SignOut } from "../../application/usecases/session/SignOut.js";

/** What the auth screens may call; built in main/. */
export interface AuthServices {
  readonly config: Pick<RuntimeConfig, "environmentName">;
  readonly listProviders: ListProviders;
  readonly beginSignIn: BeginSignIn;
  readonly completeSignIn: CompleteSignIn;
  readonly reAuthenticate: ReAuthenticate;
  readonly signOut: SignOut;
  readonly session: Session;
  readonly prefs: PreferencesPort;
  readonly drafts: DraftStore;
  /** In the hidden renewal frame, hands the callback URL to the parent and returns true. */
  readonly relayCallbackToParent: () => boolean;
}

export const AuthContext = createContext<AuthServices | null>(null);

export function useAuth(): AuthServices {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthContext is not provided; wrap the app in main/");
  return ctx;
}

/** The session state as a React value; re-renders on sign-out, expiry and sign-in. */
export function useSessionState(session: Session): SessionState {
  return useSyncExternalStore(
    (cb) => session.onChange(cb),
    () => session.state,
  );
}
