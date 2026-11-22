/** Remembers that the server's contract is newer than the SDK's, until dismissed (D47). */
export class ContractNotice {
  #shown = false;
  #dismissed = false;
  readonly #listeners = new Set<() => void>();

  get visible(): boolean {
    return this.#shown && !this.#dismissed;
  }
  /** Called by the SDK's `onContractMismatch`. */
  report(): void {
    if (this.#shown) return;
    this.#shown = true;
    this.#emit();
  }
  dismiss(): void {
    this.#dismissed = true;
    this.#emit();
  }
  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }
  #emit(): void {
    for (const fn of [...this.#listeners]) fn();
  }
}
