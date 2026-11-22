/** Supplies a bearer token. `forceRefresh` is true on the single retry after a 401. */
export type TokenSupplier = (opts: { forceRefresh: boolean }) => string | Promise<string>;

/** How requests are authenticated. */
export interface AuthProvider {
  readonly kind: "bearer" | "apiKey";
  /** The Authorization header value for the next request. */
  authorization(opts: { forceRefresh: boolean }): Promise<string>;
}

/** An IdP access token from `supplier`; the latest token is used for every request. */
export function bearer(supplier: TokenSupplier): AuthProvider {
  return {
    kind: "bearer",
    authorization: async (o) => `Bearer ${await supplier(o)}`,
  };
}

/** A team or service API key (`afsk_…`). The key is never echoed in an error. */
export function apiKey(key: string): AuthProvider {
  if (!key.startsWith("afsk_")) throw new TypeError("An AFS API key starts with afsk_");
  return { kind: "apiKey", authorization: async () => `Bearer ${key}` };
}
