import type { PreferencesPort } from "../../application/ports/preferences.js";

/** Non-secret preferences in `localStorage`; every access tolerates storage being unavailable. */
export class LocalPreferences implements PreferencesPort {
  constructor(private readonly store: () => Storage | undefined = () => globalThis.localStorage) {}

  #s(): Storage | undefined {
    try {
      return this.store();
    } catch {
      return undefined;
    }
  }
  get(key: string): string | undefined {
    try {
      return this.#s()?.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }
  set(key: string, value: string): void {
    try {
      this.#s()?.setItem(key, value);
    } catch {
      // storage full or blocked: preferences are best effort
    }
  }
  remove(key: string): void {
    try {
      this.#s()?.removeItem(key);
    } catch {
      // best effort
    }
  }
}
