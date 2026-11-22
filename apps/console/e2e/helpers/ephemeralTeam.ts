import type { Page } from "@playwright/test";

/**
 * Makes the fake's first team an ephemeral team for this page: every `GetTeam` and `ListTeams` answer is
 * rewritten (the browser sees `kind: ephemeral` and an expiry), and nothing else about the fake changes.
 */
export async function asEphemeral(
  page: Page,
  over: Record<string, unknown> = {},
  teamId?: string,
): Promise<void> {
  const patch = {
    kind: "ephemeral",
    expiresAt: new Date(Date.now() + 9 * 86_400_000).toISOString().replace(/\.\d+Z$/, "Z"),
    teardownRule: "at_cap_or_expiry",
    ...over,
  };
  await page.route(/\/v1\/teams(\/[^/?]+)?(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const res = await route.fetch();
    const body = (await res.json()) as { id?: string; items?: { id: string }[] };
    const hit = (t: { id?: string }) => teamId === undefined || t.id === teamId;
    if (body.items) body.items = body.items.map((t) => (hit(t) ? { ...t, ...patch } : t));
    else if (hit(body)) Object.assign(body, patch);
    return route.fulfill({ response: res, json: body });
  });
}
