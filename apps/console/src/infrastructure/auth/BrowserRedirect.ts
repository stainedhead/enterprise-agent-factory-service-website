import type { RedirectPort } from "../../application/ports/auth.js";

export class BrowserRedirect implements RedirectPort {
  navigate(url: string): void {
    window.location.assign(url);
  }
  replaceUrl(path: string): void {
    window.history.replaceState(null, "", path);
  }
}

export const systemClock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clearTimeout: (h: unknown): void => clearTimeout(h as ReturnType<typeof setTimeout>),
};
