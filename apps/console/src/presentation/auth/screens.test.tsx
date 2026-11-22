import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/axe.js";
import { AuthError, type SessionMessage } from "../../application/ports/auth.js";
import type { ProviderInfo } from "../../application/ports/config.js";
import { DraftStore } from "../../application/usecases/session/DraftStore.js";
import { Session } from "../../application/usecases/session/Session.js";
import { SecretInput } from "../components/index.js";
import { AuthContext, type AuthServices } from "./AuthContext.js";
import {
  CallbackPage,
  ConfigErrorPage,
  SessionExpiredDialog,
  SignedOutPage,
  SignedOutWatcher,
  SignInPage,
  TeamNotFoundPage,
} from "./screens.js";

const p = (id: string, isDefault = false): ProviderInfo => ({
  id,
  kind: "okta",
  name: `Provider ${id}`,
  issuerUrl: "https://i.test",
  consoleClientId: "c",
  isDefault,
});

function services(
  over: Partial<{
    providers: ProviderInfo[];
    remembered: string;
    complete: AuthServices["completeSignIn"]["execute"];
    relay: boolean;
  }> = {},
) {
  const prefs = new Map<string, string>(over.remembered ? [["afs.provider", over.remembered]] : []);
  const begin = vi.fn(async () => {});
  const reauth = vi.fn(async () => {});
  const handlers: ((m: SessionMessage) => void)[] = [];
  const session = new Session({
    oidc: {} as never,
    clock: { now: () => 0, setTimeout: () => 0, clearTimeout: () => {} },
    channel: {
      post: () => {},
      subscribe: (h) => {
        handlers.push(h);
        return () => {};
      },
    },
    redirectUri: "r",
    providerById: () => undefined,
  });
  const svc: AuthServices = {
    config: { environmentName: "Dev" },
    listProviders: {
      execute: async () => ({
        providers: over.providers ?? [p("a", true), p("b")],
        usedFallback: false,
      }),
    } as never,
    beginSignIn: { execute: begin } as never,
    completeSignIn: {
      execute:
        over.complete ?? (async () => ({ kind: "signed-in" as const, returnTo: "/t/team_1" })),
    } as never,
    reAuthenticate: { execute: reauth } as never,
    signOut: {} as never,
    session,
    prefs: {
      get: (k) => prefs.get(k),
      set: (k, v) => void prefs.set(k, v),
      remove: (k) => void prefs.delete(k),
    },
    drafts: new DraftStore(),
    relayCallbackToParent: () => over.relay ?? false,
  };
  return { svc, begin, reauth, prefs, session, handlers };
}

function Where() {
  const l = useLocation();
  return (
    <p data-testid="where">
      {l.pathname}
      {l.search}
    </p>
  );
}

function mount(svc: AuthServices, entry: string) {
  return render(
    <AuthContext.Provider value={svc}>
      <MemoryRouter initialEntries={[entry]}>
        <SignedOutWatcher />
        <SessionExpiredDialog />
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/auth/callback" element={<CallbackPage />} />
          <Route path="/signed-out" element={<SignedOutPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe("SignInPage", () => {
  it("shows the picker with the default preselected, remembers the choice and is axe-clean", async () => {
    const { svc, begin, prefs } = services();
    const { container } = mount(svc, "/sign-in?returnTo=%2Ft%2Fteam_1");
    const radio = (await screen.findByLabelText("Provider a")) as HTMLInputElement;
    expect(radio.checked).toBe(true);
    await expectNoA11yViolations(container);
    await userEvent.click(screen.getByLabelText("Provider b"));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(begin).toHaveBeenCalledWith(p("b"), "/t/team_1", undefined);
    expect(prefs.get("afs.provider")).toBe("b");
  });
  it("preselects the remembered provider", async () => {
    const { svc } = services({ remembered: "b" });
    mount(svc, "/sign-in");
    expect(((await screen.findByLabelText("Provider b")) as HTMLInputElement).checked).toBe(true);
  });
  it("goes straight to a sole provider and to a deep-link provider", async () => {
    const one = services({ providers: [p("a")] });
    mount(one.svc, "/sign-in");
    await waitFor(() => expect(one.begin).toHaveBeenCalledWith(p("a"), "/", undefined));
    const two = services();
    mount(two.svc, "/sign-in?provider=b");
    await waitFor(() => expect(two.begin).toHaveBeenCalledWith(p("b"), "/", undefined));
  });
  it("a teamId deep link signs in with the remembered provider and opens that team", async () => {
    const { svc, begin } = services({ remembered: "b" });
    mount(svc, "/sign-in?teamId=team_9");
    await waitFor(() => expect(begin).toHaveBeenCalledWith(p("b"), "/t/team_9", undefined));
  });
  it("never uses an unsafe returnTo", async () => {
    const { svc, begin } = services({ providers: [p("a")] });
    mount(svc, "/sign-in?returnTo=https%3A%2F%2Fevil.test");
    await waitFor(() => expect(begin).toHaveBeenCalledWith(p("a"), "/", undefined));
  });
  it("pick=1 shows the picker and forces the IdP page", async () => {
    const { svc, begin } = services({ providers: [p("a")] });
    mount(svc, "/sign-in?pick=1");
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(begin).toHaveBeenCalledWith(p("a"), "/", "login");
  });
  it("explains when there is no provider or the provider cannot be reached", async () => {
    mount(services({ providers: [] }).svc, "/sign-in");
    expect(await screen.findByText("No sign-in provider is configured")).toBeTruthy();
    const bad = services({ providers: [p("a")] });
    bad.begin.mockRejectedValueOnce(new Error("down"));
    mount(bad.svc, "/sign-in");
    expect(await screen.findByText("Could not start sign-in")).toBeTruthy();
  });
  it("tells the user that browser storage is required when it is blocked (FR-012)", async () => {
    const blocked = services({ providers: [p("a")] });
    blocked.begin.mockRejectedValueOnce(
      new AuthError("storage", "Browser storage is required for sign-in."),
    );
    mount(blocked.svc, "/sign-in");
    expect(await screen.findByText(/Browser storage is required for sign-in/)).toBeTruthy();
    expect(screen.queryByText(/could not be reached/)).toBeNull();
  });
});

describe("CallbackPage", () => {
  it("completes sign-in and replaces the URL with the saved route", async () => {
    mount(services().svc, "/auth/callback?code=1&state=2");
    await waitFor(() => expect(screen.getAllByTestId("where")[0]?.textContent).toBe("/t/team_1"));
  });
  it("goes to the sign-in page when the IdP needs the user", async () => {
    mount(
      services({ complete: async () => ({ kind: "login-required", returnTo: "/" }) }).svc,
      "/auth/callback",
    );
    expect(await screen.findByText("Sign in to Agent Factory")).toBeTruthy();
  });
  it("keeps the saved route through login-required: the picker gets ?returnTo= (FR-013)", async () => {
    const { svc, begin } = services({
      complete: async () => ({ kind: "login-required", returnTo: "/t/team_1/agents?tab=x" }),
    });
    mount(svc, "/auth/callback?error=login_required&state=s");
    await waitFor(() =>
      expect(screen.getAllByTestId("where").map((e) => e.textContent)).toContain(
        "/sign-in?returnTo=%2Ft%2Fteam_1%2Fagents%3Ftab%3Dx",
      ),
    );
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(begin).toHaveBeenCalledWith(p("a", true), "/t/team_1/agents?tab=x", undefined);
  });
  it("never forwards an unsafe return route", async () => {
    mount(
      services({
        complete: async () => ({ kind: "login-required", returnTo: "https://evil.test" }),
      }).svc,
      "/auth/callback",
    );
    await screen.findByText("Sign in to Agent Factory");
    expect(screen.getAllByTestId("where").map((e) => e.textContent)).toContain("/sign-in");
  });
  it("shows an error page, never a half signed-in state, on a refused callback", async () => {
    const { container } = mount(
      services({
        complete: async () => ({ kind: "error", error: new AuthError("state", "bad state") }),
      }).svc,
      "/auth/callback",
    );
    expect(await screen.findByText("You were not signed in")).toBeTruthy();
    expect(screen.getByText("bad state")).toBeTruthy();
    await expectNoA11yViolations(container);
  });
  it("only relays to the parent when inside the renewal frame", async () => {
    const complete = vi.fn();
    mount(services({ relay: true, complete }).svc, "/auth/callback?code=1");
    await Promise.resolve();
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("static pages", () => {
  it("are axe-clean", async () => {
    for (const ui of [
      <SignedOutPage key="a" />,
      <TeamNotFoundPage key="b" />,
      <ConfigErrorPage key="c" reasons={["apiUrl must be an http(s) URL"]} />,
    ]) {
      const { container, unmount } = render(<MemoryRouter>{ui}</MemoryRouter>);
      await expectNoA11yViolations(container);
      unmount();
    }
  });
  it("team-not-found offers another provider and does not confirm the team", () => {
    render(
      <MemoryRouter>
        <TeamNotFoundPage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: "Sign in with another provider" }).getAttribute("href"),
    ).toBe("/sign-in?pick=1");
    expect(screen.getByText(/does not exist, or you do not have access/)).toBeTruthy();
  });
});

describe("session expiry and sign-out", () => {
  it("shows the dialog, clears secret inputs and re-authenticates at the same route", async () => {
    const { svc, reauth } = services({ remembered: "b" });
    svc.session.establish({ accessToken: "t", expiresAt: 1e12, providerId: "x" });
    window.history.replaceState(null, "", "/t/team_1/agents");
    render(
      <AuthContext.Provider value={svc}>
        <MemoryRouter>
          <label htmlFor="v">Value</label>
          <SecretInput id="v" name="v" />
          <SessionExpiredDialog />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    await userEvent.type(screen.getByLabelText("Value"), "s3cret");
    act(() => svc.session.expire());
    expect(await screen.findByRole("dialog", { name: "Your session has expired" })).toBeTruthy();
    expect((screen.getByLabelText("Value") as HTMLInputElement).value).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "Sign in again" }));
    expect(reauth).toHaveBeenCalledWith(p("b"), "/t/team_1/agents");
  });
  describe("error path of the dialog (FR-014)", () => {
    const openExpired = async (over: Parameters<typeof services>[0] = {}) => {
      const s = services({ remembered: "b", ...over });
      s.svc.session.establish({ accessToken: "t", expiresAt: 1e12, providerId: "x" });
      render(
        <AuthContext.Provider value={s.svc}>
          <MemoryRouter>
            <SessionExpiredDialog />
          </MemoryRouter>
        </AuthContext.Provider>,
      );
      act(() => s.svc.session.expire());
      const dialog = await screen.findByRole("dialog", { name: "Your session has expired" });
      return { ...s, dialog };
    };
    const expectAlertInDialog = async (dialog: HTMLElement) => {
      const alert = await within(dialog).findByRole("alert");
      expect(alert.textContent).toMatch(/sign|provider|again/i);
      const button = within(dialog).getByRole("button", { name: "Sign in again" });
      await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    };
    it("shows an alert and re-enables the button when listing the providers fails", async () => {
      const s = await openExpired();
      (s.svc.listProviders as unknown as { execute: unknown }).execute = async () => {
        throw new Error("discovery failed");
      };
      await userEvent.click(within(s.dialog).getByRole("button", { name: "Sign in again" }));
      await expectAlertInDialog(s.dialog);
      expect(s.reauth).not.toHaveBeenCalled();
    });
    it("shows an alert and re-enables the button when re-authentication fails", async () => {
      const s = await openExpired();
      s.reauth.mockRejectedValueOnce(new Error("idp down"));
      await userEvent.click(within(s.dialog).getByRole("button", { name: "Sign in again" }));
      await expectAlertInDialog(s.dialog);
      // and a second try works
      await userEvent.click(within(s.dialog).getByRole("button", { name: "Sign in again" }));
      await waitFor(() => expect(s.reauth).toHaveBeenCalledTimes(2));
    });
    it("shows an alert and re-enables the button when no provider is found", async () => {
      const s = await openExpired({ providers: [] });
      await userEvent.click(within(s.dialog).getByRole("button", { name: "Sign in again" }));
      await expectAlertInDialog(s.dialog);
      expect(s.reauth).not.toHaveBeenCalled();
    });
    it("clears the alert when the user tries again", async () => {
      const s = await openExpired();
      s.reauth.mockRejectedValueOnce(new Error("idp down"));
      await userEvent.click(within(s.dialog).getByRole("button", { name: "Sign in again" }));
      await within(s.dialog).findByRole("alert");
      await userEvent.click(within(s.dialog).getByRole("button", { name: "Sign in again" }));
      await waitFor(() => expect(within(s.dialog).queryByRole("alert")).toBeNull());
    });
  });
  it("sign-out in another tab lands on /signed-out", async () => {
    const { svc, handlers } = services();
    mount(svc, "/t/x");
    act(() => svc.session.establish({ accessToken: "t", expiresAt: 1e12, providerId: "x" }));
    act(() => handlers[0]?.("signout"));
    expect(await screen.findByText("You have signed out")).toBeTruthy();
  });
});
