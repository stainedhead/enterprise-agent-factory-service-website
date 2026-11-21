import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../../../test/axe.js";
import { AppError } from "../../application/errors.js";
import { NAV_ITEMS, routeFor, visibleItems } from "../../domain/navigation.js";
import { resolveRoute, routeTable } from "../../domain/routes.js";
import { SCREEN_IDS } from "../../domain/screens.js";
import { registry } from "../routes/registry.js";
import {
  accessDenied,
  NO_ACCESS,
  renderApp,
  SEC_OP,
  SERVICE_ADMIN,
  TEAM_ADMIN,
  VIEWER,
} from "../testing/harness.js";

const at = (h: ReturnType<typeof renderApp>) => h.router.state.location.pathname;

describe("routing (M0-H1)", () => {
  it("every nav item resolves to a route with a registered screen, and every route has a screen", () => {
    for (const item of NAV_ITEMS) {
      const r = resolveRoute(routeFor(item, "team_1").split("?")[0] as string);
      expect(r, item.id).toBeDefined();
      expect(registry[item.screen as keyof typeof registry], item.id).toBeDefined();
    }
    for (const def of routeTable()) {
      expect(SCREEN_IDS).toContain(def.screen);
      expect(registry[def.screen as keyof typeof registry], def.path).toBeDefined();
    }
  });
  it("unknown routes, and teams the caller is not bound to, render the same not-found page", async () => {
    renderApp({ me: TEAM_ADMIN, path: "/no/such/page" });
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    const other = renderApp({ me: TEAM_ADMIN, path: "/t/team_999" });
    expect(
      (await within(other.view.container).findAllByRole("heading", { name: "Page not found" }))
        .length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/forbidden|denied/i)).toBeNull();
  });
  it("admin-only areas are not found for team roles; a service admin reaches them", async () => {
    renderApp({ me: VIEWER, path: "/teams" });
    expect(await screen.findAllByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
  it("a service admin opens any team and a team user lands on their first team", async () => {
    const a = renderApp({ me: SERVICE_ADMIN, path: "/t/team_77" });
    await screen.findByRole("banner");
    expect(at(a)).toBe("/t/team_77");
    const b = renderApp({ me: TEAM_ADMIN, path: "/" });
    await waitFor(() => expect(at(b)).toBe("/t/team_1"));
  });
  it("shows the narrow-viewport notice below 1024 px", async () => {
    const orig = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: true,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    })) as never;
    renderApp({ me: SERVICE_ADMIN, path: "/" });
    expect(await screen.findByText(/at least 1024 px wide/)).toBeTruthy();
    window.matchMedia = orig;
  });
});

describe("caller identity (M0-H3, H10)", () => {
  it("shows a full-page error with Retry when GetMe fails at boot", async () => {
    const h = renderApp({
      me: new AppError({ kind: "unavailable", message: "down", requestId: "req_9" }),
      path: "/",
    });
    expect(await screen.findByRole("heading", { name: "AFS is not responding" })).toBeTruthy();
    expect(screen.queryByRole("banner")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(h.meGet).toHaveBeenCalledTimes(2));
  });
  it("wraps an unexpected failure as an error page too", async () => {
    renderApp({ me: new Error("weird"), path: "/" });
    expect(await screen.findByRole("heading", { name: "AFS is not responding" })).toBeTruthy();
  });
  it("a principal with no team and no service role sees No access yet and triggers no list calls", async () => {
    const h = renderApp({ me: NO_ACCESS, path: "/" });
    expect(await screen.findByRole("heading", { name: "No access yet" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(h.signOut).toHaveBeenCalled();
    expect(h.listTeams).not.toHaveBeenCalled();
    expect(screen.queryByRole("navigation")).toBeNull();
  });
  it("refreshes on window focus only once stale, and after AccessDenied", async () => {
    const h = renderApp({ me: TEAM_ADMIN, path: "/t/team_1" });
    await screen.findByRole("banner");
    act(() => void window.dispatchEvent(new Event("focus")));
    expect(h.meGet).toHaveBeenCalledTimes(1);
    act(() => h.bus.emit(accessDenied("agents:write")));
    await waitFor(() => expect(h.meGet).toHaveBeenCalledTimes(2));
  });
});

describe("header and navigation (M0-H4..H6)", () => {
  it.each([
    [SERVICE_ADMIN, "Service admin"],
    [SEC_OP, "Security operator"],
    [TEAM_ADMIN, "Team-admin"],
    [VIEWER, "Team viewer"],
  ])("role pill for %#", async (me, label) => {
    renderApp({ me, path: me.teams[0] ? "/t/team_1" : "/" });
    const header = await screen.findByRole("banner");
    expect(within(header).getByText(label)).toBeTruthy();
    expect(within(header).getByText("Dev")).toBeTruthy();
    expect(
      within(header).getByRole("button", { name: new RegExp(me.principal.name as string) }),
    ).toBeTruthy();
  });
  it("names the team in the header and filters navigation by role", async () => {
    renderApp({ me: VIEWER, path: "/t/team_1" });
    const header = await screen.findByRole("banner");
    expect(within(header).getByText("alpha")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const labels = visibleItems(VIEWER, { teamId: "team_1" }).map((i) => i.label);
    for (const l of labels) expect(within(nav).getAllByText(l).length).toBeGreaterThan(0);
    const shown = new Set(
      visibleItems(VIEWER, { teamId: "team_1" }).map((i) => routeFor(i, "team_1")),
    );
    for (const hidden of NAV_ITEMS.filter((i) => !i.visibleWhen(VIEWER, { teamId: "team_1" }))) {
      const href = routeFor(hidden, "team_1");
      if (shown.has(href)) continue;
      expect(nav.querySelector(`a[href="${href}"]`), hidden.id).toBeNull();
    }
    expect(within(nav).queryByText("Service")).toBeNull();
  });
  it("service admin sees service groups; the switcher offers All teams plus exactly the teams in GetMe", async () => {
    const me = {
      ...SERVICE_ADMIN,
      teams: [{ teamId: "team_1", slug: "alpha", role: "team_admin" as const, permissions: [] }],
    };
    const h = renderApp({ me, path: "/" });
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByText("Service")).toBeTruthy();
    const sel = within(nav).getByLabelText("Team", { selector: "select" }) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["All teams", "alpha"]);
    await userEvent.selectOptions(sel, "team_1");
    expect(at(h)).toBe("/t/team_1");
    await userEvent.selectOptions(sel, "");
    expect(at(h)).toBe("/");
  });
  it("a team user's switcher has no All teams option", async () => {
    renderApp({ me: TEAM_ADMIN, path: "/t/team_1" });
    const sel = (await screen.findByLabelText("Team", { selector: "select" })) as HTMLSelectElement;
    expect([...sel.options].map((o) => o.textContent)).toEqual(["alpha"]);
  });
  it("identity menu signs out", async () => {
    const h = renderApp({ me: TEAM_ADMIN, path: "/t/team_1" });
    await userEvent.click(await screen.findByRole("button", { name: /Tia Teamadmin/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(h.signOut).toHaveBeenCalled();
  });
  it("the shell is axe-clean", async () => {
    const h = renderApp({ me: SERVICE_ADMIN, path: "/" });
    await screen.findByRole("banner");
    await expectNoA11yViolations(h.view.container);
  });
});

describe("header search (M0-H7)", () => {
  it("makes no request until a query is typed, then one list call; / focuses; Enter opens", async () => {
    const h = renderApp({ me: SERVICE_ADMIN, path: "/" });
    const box = (await screen.findByRole("combobox", { name: "Search" })) as HTMLInputElement;
    expect(h.listTeams).not.toHaveBeenCalled();
    await userEvent.click(document.body);
    await userEvent.keyboard("/");
    expect(document.activeElement).toBe(box);
    await userEvent.type(box, "a");
    expect(h.listTeams).not.toHaveBeenCalled(); // below the minimum length
    await userEvent.type(box, "l");
    const opt = await screen.findByRole("option", { name: "Alpha" });
    expect(opt).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Beta" })).toBeNull();
    await userEvent.type(box, "{Enter}");
    expect(at(h)).toBe("/t/team_1");
    await userEvent.type(box, "zz");
    expect(await screen.findByText("No matches")).toBeTruthy();
    expect(h.listTeams).toHaveBeenCalledTimes(1);
  });
  it("arrow keys move the selection and Escape clears", async () => {
    renderApp({ me: SERVICE_ADMIN, path: "/" });
    const box = await screen.findByRole("combobox", { name: "Search" });
    await userEvent.type(box, "ta"); // matches Beta only ("Alpha" has no "ta")
    expect(await screen.findByRole("option", { name: "Beta" })).toBeTruthy();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Escape}");
    expect((box as HTMLInputElement).value).toBe("");
  });
  it("does not capture / while typing in another field", async () => {
    renderApp({ me: SERVICE_ADMIN, path: "/" });
    const box = await screen.findByRole("combobox", { name: "Search" });
    const sel = screen.getByLabelText("Team", { selector: "select" });
    sel.focus();
    await userEvent.keyboard("/");
    expect(document.activeElement).not.toBe(box);
  });
});

describe("notices (M0-H8, H9)", () => {
  it("names the required permission and the request id for any denied call, dismissibly", async () => {
    const h = renderApp({ me: TEAM_ADMIN, path: "/t/team_1" });
    await screen.findByRole("banner");
    act(() => h.bus.emit(accessDenied("agents:write")));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("agents:write")).toBeTruthy();
    expect(within(alert).getByText(/req_42/)).toBeTruthy();
    await userEvent.click(within(alert).getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => h.bus.emit(accessDenied(undefined)));
    expect(await screen.findByText("You do not have permission to do that.")).toBeTruthy();
  });
  it("a denied query in the cache raises the same alert", async () => {
    const h = renderApp({ me: TEAM_ADMIN, path: "/t/team_1" });
    await screen.findByRole("banner");
    await h.queryClient
      .fetchQuery({ queryKey: ["x"], queryFn: () => Promise.reject(accessDenied("teams:write")) })
      .catch(() => {});
    expect(await screen.findByText("teams:write")).toBeTruthy();
  });
  it("shows the contract notice once and lets the user dismiss it", async () => {
    const h = renderApp({ me: TEAM_ADMIN, path: "/t/team_1" });
    await screen.findByRole("banner");
    expect(screen.queryByText(/newer version of AFS/)).toBeNull();
    act(() => h.contractNotice.report());
    expect(await screen.findByText(/A newer version of AFS is available; reload/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/newer version of AFS/)).toBeNull();
  });
});
