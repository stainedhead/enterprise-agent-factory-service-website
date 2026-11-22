import { Suspense } from "react";
import { Navigate, Outlet, type RouteObject, useLocation } from "react-router";
import { teamOf } from "../../domain/me.js";
import { routeFor, screenFor, visibleItems } from "../../domain/navigation.js";
import { type RouteDef, resolveRoute, routeTable } from "../../domain/routes.js";
import {
  CallbackPage,
  SessionExpiredDialog,
  SignedOutPage,
  SignedOutWatcher,
  SignInPage,
} from "../auth/screens.js";
import { useTeamKind } from "../hooks/useTeamKind.js";
import {
  AccessDeniedAlert,
  ContractBanner,
  Header,
  NarrowViewportNotice,
  SideNav,
} from "../shell/Chrome.js";
import { GlobalBanners } from "../shell/GlobalBanners.js";
import { MeGate } from "../shell/MeGate.js";
import { NotFoundPage } from "../shell/pages.js";
import { useMe } from "../shell/ShellContext.js";
import s from "../shell/shell.module.css";
import { TeamLayout } from "../shell/TeamLayout.js";
import { registry } from "./registry.js";

/** The team in the URL, only for the `/t/:teamId/...` routes. */
export function teamIdOf(pathname: string): string | undefined {
  if (!pathname.startsWith("/t/")) return undefined;
  return resolveRoute(pathname)?.params.teamId;
}

function Shell() {
  const me = useMe();
  const { pathname } = useLocation();
  const teamId = teamIdOf(pathname);
  return (
    <div className={s.root}>
      <Header me={me} teamId={teamId} />
      <SideNav me={me} teamId={teamId} />
      <main className={s.main} id="main">
        <NarrowViewportNotice />
        <ContractBanner />
        <AccessDeniedAlert />
        <GlobalBanners />
        <Suspense fallback={<p role="status">Loading…</p>}>
          {teamId ? (
            <TeamLayout teamId={teamId}>
              <Outlet />
            </TeamLayout>
          ) : (
            <Outlet />
          )}
        </Suspense>
      </main>
    </div>
  );
}

/** Session-bound layout: the caller is loaded, then the shell wraps every console route. */
function ConsoleLayout() {
  return (
    <>
      {/* outside the gate: they must outlive the caller being cleared on sign-out */}
      <SignedOutWatcher />
      <SessionExpiredDialog />
      <MeGate>
        <Shell />
      </MeGate>
    </>
  );
}

function ScreenRoute({ def }: { def: RouteDef }) {
  const me = useMe();
  const { pathname } = useLocation();
  const teamId = teamIdOf(pathname);
  const { kind, loading } = useTeamKind(teamId);
  if (pathname === "/" && !me.serviceAdmin) {
    const first = me.teams[0];
    if (first) return <Navigate to={`/t/${first.teamId}`} replace />;
    const item = visibleItems(me)[0];
    return item ? <Navigate to={routeFor(item)} replace /> : <NotFoundPage />;
  }
  // A team the caller is not bound to is "not found", never "forbidden" (WD-14).
  if (teamId && !me.serviceAdmin && !teamOf(me, teamId)) return <NotFoundPage team />;
  if (def.item && !def.item.visibleWhen(me, teamId ? { teamId, ...(kind && { kind }) } : undefined))
    return loading ? <p role="status">Loading…</p> : <NotFoundPage />;
  const screen = def.item ? screenFor(def.item, me, teamId) : def.screen;
  const Screen = registry[screen as keyof typeof registry];
  return Screen ? <Screen /> : <NotFoundPage />;
}

/** Router configuration: auth pages outside the shell, every console route inside it. */
export function appRoutes(): RouteObject[] {
  return [
    { path: "/sign-in", element: <SignInPage /> },
    { path: "/auth/callback", element: <CallbackPage /> },
    { path: "/signed-out", element: <SignedOutPage /> },
    {
      element: <ConsoleLayout />,
      children: [
        ...routeTable().map((def) => ({ path: def.path, element: <ScreenRoute def={def} /> })),
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ];
}
