import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import type { ProviderInfo } from "../../application/ports/config.js";
import { PROVIDER_PREF, safeReturnTo } from "../../application/usecases/session/Boot.js";
import { chooseProvider } from "../../application/usecases/session/chooseProvider.js";
import { Alert, Button, Modal } from "../components/index.js";
import { clearAllSecretInputs } from "../components/secretRegistry.js";
import { useAuth, useSessionState } from "./AuthContext.js";
import s from "./auth.module.css";

function Centered({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={s.center}>
      <div className={s.panel}>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

/** `/sign-in`: provider picker, deep links and straight-through sign-in (WEB-US-7.1, 7.2). */
export function SignInPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "none" }
    | { kind: "pick"; providers: readonly ProviderInfo[]; selected: string }
    | { kind: "failed"; message: string }
  >({ kind: "loading" });
  const started = useRef(false);

  const teamId = params.get("teamId") ?? undefined;
  const returnTo = teamId
    ? `/t/${encodeURIComponent(teamId)}`
    : safeReturnTo(params.get("returnTo"));
  const forcePick = params.get("pick") === "1";

  const go = (p: ProviderInfo) => {
    auth.prefs.set(PROVIDER_PREF, p.id);
    auth.beginSignIn
      .execute(p, returnTo, forcePick ? "login" : undefined)
      .catch(() =>
        setState({ kind: "failed", message: "The sign-in provider could not be reached." }),
      );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per mount
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void auth.listProviders.execute().then(({ providers }) => {
      const choice = chooseProvider({
        providers,
        remembered: auth.prefs.get(PROVIDER_PREF),
        deepLinkProvider: params.get("provider") ?? undefined,
      });
      if (choice.kind === "none") return setState({ kind: "none" });
      if (forcePick)
        return setState({
          kind: "pick",
          providers,
          selected: choice.kind === "pick" ? choice.preselected : choice.provider.id,
        });
      if (choice.kind === "redirect") return go(choice.provider);
      if (teamId) return go(providers.find((p) => p.id === choice.preselected) as ProviderInfo);
      setState({ kind: "pick", providers: choice.providers, selected: choice.preselected });
    });
  }, []);

  if (state.kind === "loading")
    return (
      <Centered title="Signing in">
        <p role="status" className={s.lead}>
          Contacting the sign-in provider…
        </p>
      </Centered>
    );
  if (state.kind === "none")
    return (
      <Centered title="Sign-in unavailable">
        <Alert kind="error" title="No sign-in provider is configured">
          Ask a service administrator to enable one.
        </Alert>
      </Centered>
    );
  if (state.kind === "failed")
    return (
      <Centered title="Sign-in unavailable">
        <Alert kind="error" title="Could not start sign-in">
          {state.message}
        </Alert>
        <p>
          <Link to="/sign-in">Try again</Link>
        </p>
      </Centered>
    );
  const selected = state.selected;
  return (
    <Centered title="Sign in to Agent Factory">
      <p className={s.lead}>{auth.config.environmentName}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const p = state.providers.find((x) => x.id === selected);
          if (p) go(p);
        }}
      >
        <fieldset className={s.providers}>
          <legend>Choose a sign-in provider</legend>
          {state.providers.map((p) => (
            <label key={p.id} className={s.option}>
              <input
                type="radio"
                name="provider"
                value={p.id}
                checked={p.id === selected}
                onChange={() => setState({ ...state, selected: p.id })}
              />
              {p.name}
            </label>
          ))}
        </fieldset>
        <Button variant="primary" type="submit">
          Continue
        </Button>
      </form>
    </Centered>
  );
}

/** `/auth/callback`: completes the code exchange once, then returns to the saved route. */
export function CallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | undefined>();
  const started = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once per mount
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (auth.relayCallbackToParent()) return;
    void auth.completeSignIn.execute(window.location.href).then((r) => {
      if (r.kind === "signed-in") navigate(r.returnTo, { replace: true });
      else if (r.kind === "login-required") navigate("/sign-in", { replace: true });
      else setError(r.error.message);
    });
  }, []);

  if (error)
    return (
      <Centered title="Sign-in failed">
        <Alert kind="error" title="You were not signed in">
          {error}
        </Alert>
        <p>
          <Link to="/sign-in">Try again</Link>
        </p>
      </Centered>
    );
  return (
    <Centered title="Signing in">
      <p role="status" className={s.lead}>
        Completing sign-in…
      </p>
    </Centered>
  );
}

/** `/signed-out`. */
export function SignedOutPage() {
  return (
    <Centered title="You have signed out">
      <p className={s.lead}>Your session has ended in this browser.</p>
      <Link to="/sign-in?pick=1">Sign in again</Link>
    </Centered>
  );
}

/** A page for a team the caller cannot see; never confirms the team exists (WD-14). */
export function TeamNotFoundPage() {
  return (
    <Centered title="Team not found">
      <p className={s.lead}>That team does not exist, or you do not have access to it.</p>
      <Link to="/sign-in?pick=1">Sign in with another provider</Link>
    </Centered>
  );
}

/** Shown instead of a blank screen when `/config.json` is missing or invalid. */
export function ConfigErrorPage({ reasons }: { reasons: readonly string[] }) {
  return (
    <Centered title="Configuration error">
      <Alert kind="error" title="The console is not configured correctly">
        <ul className={s.reasons}>
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Alert>
    </Centered>
  );
}

/**
 * The session-expired dialog (WEB-US-7.7): secret inputs are cleared, non-secret drafts are kept in
 * memory, and re-authenticating returns to the same route.
 */
export function SessionExpiredDialog() {
  const auth = useAuth();
  const state = useSessionState(auth.session);
  const [busy, setBusy] = useState(false);
  const expired = state === "expired";

  useEffect(() => {
    if (expired) clearAllSecretInputs();
  }, [expired]);

  if (!expired) return null;
  const reauth = async () => {
    setBusy(true);
    const { providers } = await auth.listProviders.execute();
    const remembered = auth.prefs.get(PROVIDER_PREF);
    const p =
      providers.find((x) => x.id === remembered) ??
      providers.find((x) => x.isDefault) ??
      providers[0];
    if (p)
      await auth.reAuthenticate.execute(p, `${window.location.pathname}${window.location.search}`);
    else setBusy(false);
  };
  return (
    <Modal
      title="Your session has expired"
      onClose={() => {}}
      actions={
        <Button variant="primary" onClick={() => void reauth()} disabled={busy}>
          Sign in again
        </Button>
      }
    >
      <p>
        Sign in again to continue. You will return to this page; anything typed that is not a secret
        is kept.
      </p>
    </Modal>
  );
}

/** Sends the user to `/signed-out` when an active session ends here or in another tab. */
export function SignedOutWatcher() {
  const auth = useAuth();
  const navigate = useNavigate();
  const state = useSessionState(auth.session);
  const wasActive = useRef(false);
  useEffect(() => {
    if (state === "active") wasActive.current = true;
    else if (state === "signed-out" && wasActive.current) {
      wasActive.current = false;
      navigate("/signed-out", { replace: true });
    }
  }, [state, navigate]);
  return null;
}
