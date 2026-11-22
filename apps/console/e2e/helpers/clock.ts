import type { Page } from "@playwright/test";
import { control } from "./control.js";

/** The instant pages that read "now" are frozen at, so their figures and baselines are stable. */
export const FROZEN_NOW = "2026-11-22T10:00:00Z";

type SignIn = (
  user: "svc-admin" | "team-admin" | "viewer" | "sec-op",
  path?: string,
) => Promise<void>;

/** Navigates inside the running app without a reload (tokens live in memory, so a reload would sign in again). */
export async function spaGo(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    history.pushState({}, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

/**
 * Signs in with a long-lived token, freezes the page clock at {@link FROZEN_NOW}, then opens `path` by
 * in-app navigation. Freezing after sign-in keeps the ID token's `iat` valid; the long token lifetime keeps
 * the session from expiring against the frozen clock.
 */
export async function openFrozen(
  page: Page,
  signInAs: SignIn,
  user: "svc-admin" | "team-admin" | "viewer" | "sec-op",
  path: string,
  now: string = FROZEN_NOW,
): Promise<void> {
  await control.idp({ ttl: 365 * 86_400 });
  await signInAs(user, "/");
  await page.clock.setFixedTime(new Date(now));
  await spaGo(page, path);
}
