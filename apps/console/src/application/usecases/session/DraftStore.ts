import type { DraftPersistPort } from "../../ports/auth.js";

/** Non-secret form drafts, in memory, kept across a session expiry (WEB-US-7.7). Secrets never enter it. */
export class DraftStore {
  readonly #drafts = new Map<string, Record<string, string>>();

  /** `persisted` is the copy that rides a re-authentication redirect; `clear()` removes it too. */
  constructor(private readonly persisted?: Pick<DraftPersistPort, "clear">) {}

  save(formId: string, fields: Record<string, string>): void {
    this.#drafts.set(formId, { ...fields });
  }
  get(formId: string): Record<string, string> | undefined {
    const d = this.#drafts.get(formId);
    return d ? { ...d } : undefined;
  }
  discard(formId: string): void {
    this.#drafts.delete(formId);
  }
  /** Sign-out: drops every draft from memory and the persisted `sessionStorage` copy. */
  clear(): void {
    this.#drafts.clear();
    this.persisted?.clear();
  }
  /** Serialisable snapshot for a top-level re-authentication redirect. */
  snapshot(): Record<string, Record<string, string>> {
    return Object.fromEntries(this.#drafts);
  }
  restore(snapshot: Record<string, Record<string, string>>): void {
    for (const [k, v] of Object.entries(snapshot)) this.#drafts.set(k, { ...v });
  }
}
