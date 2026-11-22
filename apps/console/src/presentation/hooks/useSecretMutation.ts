import { useCallback, useRef, useState } from "react";
import { clearAllSecretInputs } from "../components/secretRegistry.js";

export interface SecretMutation<V, R> {
  /** Runs the use case; resolves with its result (a one-time `secretKey` goes straight to the dialog). */
  run(vars: V): Promise<R | undefined>;
  readonly pending: boolean;
  readonly error: unknown;
}

/**
 * Secret-bearing mutations (WD-31, WEB-8): deliberately not `useMutation`. The variables and the result
 * never enter the mutation cache, are not held in React state, and every secret input is scrubbed as the
 * request completes (success or failure). Only a pending flag and the error are state.
 */
export function useSecretMutation<V, R>(fn: (vars: V) => Promise<R>): SecretMutation<V, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const f = useRef(fn);
  f.current = fn;

  const run = useCallback(async (vars: V) => {
    setPending(true);
    setError(undefined);
    try {
      return await f.current(vars);
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      clearAllSecretInputs();
      setPending(false);
    }
  }, []);

  return { run, pending, error };
}
