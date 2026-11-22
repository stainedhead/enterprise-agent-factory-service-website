import { EXTRA_ROUTES, NAV_ITEMS, type NavItem, SYSTEM_ROUTES } from "./navigation.js";
import type { ScreenId } from "./screens.js";

const stripQuery = (route: string) => route.split("?")[0] as string;

export interface RouteDef {
  /** Path pattern with `:param` segments. */
  readonly path: string;
  readonly screen: ScreenId;
  /** The navigation item this route belongs to, when it is one. */
  readonly item?: NavItem;
}

/** Every console route (navigation items first, then extras), one entry per path. */
export function routeTable(): RouteDef[] {
  const seen = new Set<string>();
  const out: RouteDef[] = [];
  for (const item of NAV_ITEMS) {
    const path = stripQuery(item.route);
    if (seen.has(path)) continue;
    seen.add(path);
    out.push({ path, screen: item.screen, item });
  }
  for (const e of EXTRA_ROUTES) {
    if (seen.has(e.route)) continue;
    seen.add(e.route);
    out.push({ path: e.route, screen: e.screen });
  }
  return out;
}

export { SYSTEM_ROUTES };

/** Matches `pathname` against a pattern; returns the params or undefined. Static segments win in the table order. */
export function matchRoute(pattern: string, pathname: string): Record<string, string> | undefined {
  const a = pattern.split("/").filter(Boolean);
  const b = pathname.split("/").filter(Boolean);
  if (a.length !== b.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const seg = a[i] as string;
    const val = b[i] as string;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(val);
    else if (seg !== val) return undefined;
  }
  return params;
}

/** The best route for `pathname`: an exact static match beats a parameterised one. */
export function resolveRoute(
  pathname: string,
): { route: RouteDef; params: Record<string, string> } | undefined {
  const hits = routeTable()
    .map((route) => ({ route, params: matchRoute(route.path, pathname) }))
    .filter(
      (h): h is { route: RouteDef; params: Record<string, string> } => h.params !== undefined,
    );
  hits.sort((x, y) => Object.keys(x.params).length - Object.keys(y.params).length);
  return hits[0];
}
