// Every mounted SecretInput registers a clear function so a session expiry can wipe them all (WEB-US-7.7).
const clearers = new Set<() => void>();

export function registerSecretInput(clear: () => void): () => void {
  clearers.add(clear);
  return () => clearers.delete(clear);
}

/** Clears every registered secret input; returns how many were cleared. */
export function clearAllSecretInputs(): number {
  const n = clearers.size;
  for (const c of clearers) c();
  return n;
}
