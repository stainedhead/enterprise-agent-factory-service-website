import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PreferencesPort,
  readTablePreferences,
  writeTablePreferences,
} from "../../application/ports/preferences.js";

export interface PageRequest {
  maxResults: number;
  nextToken?: string;
  signal: AbortSignal;
}
export interface PageResult<T> {
  items: T[];
  nextToken?: string | undefined;
}

export const LIST_REFRESHED = "The list was refreshed";

/**
 * Server pagination with `maxResults`/`nextToken`. Page tokens are remembered so *Previous* works; an
 * expired or refused token restarts from the first page with a notice (edge case, M0-U3).
 */
export function useServerPages<T>(opts: {
  load: (req: PageRequest) => Promise<PageResult<T>>;
  isInvalidToken?: (e: unknown) => boolean;
  defaultPageSize?: number;
  preferences?: PreferencesPort;
  tableId?: string;
}) {
  const stored =
    opts.preferences && opts.tableId
      ? readTablePreferences(opts.preferences, opts.tableId).pageSize
      : undefined;
  const [pageSize, setPageSizeState] = useState(stored ?? opts.defaultPageSize ?? 25);
  const [tokens, setTokens] = useState<(string | undefined)[]>([undefined]);
  const [index, setIndex] = useState(0);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    status: "loading" | "ready" | "error";
    items: T[];
    error?: unknown;
    notice?: string;
  }>({
    status: "loading",
    items: [],
  });
  const load = useRef(opts.load);
  load.current = opts.load;
  const invalid = useRef(opts.isInvalidToken);
  invalid.current = opts.isInvalidToken;
  const next = useRef<string | undefined>(undefined);

  // biome-ignore lint/correctness/useExhaustiveDependencies: tokens are read at the time the page index changes
  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, status: "loading" }));
    const token = tokens[index];
    load
      .current({
        maxResults: pageSize,
        ...(token !== undefined && { nextToken: token }),
        signal: ctl.signal,
      })
      .then((r) => {
        if (ctl.signal.aborted) return;
        next.current = r.nextToken;
        setState((s) => ({
          status: "ready",
          items: r.items,
          ...(s.notice && index === 0 && { notice: s.notice }),
        }));
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        if (index > 0 && invalid.current?.(e)) {
          setTokens([undefined]);
          setIndex(0);
          setState({ status: "loading", items: [], notice: LIST_REFRESHED });
          return;
        }
        setState({ status: "error", items: [], error: e });
      });
    return () => ctl.abort();
  }, [index, pageSize, version]);

  const goNext = useCallback(() => {
    const t = next.current;
    if (t === undefined) return;
    setTokens((ts) => [...ts.slice(0, index + 1), t]);
    setIndex(index + 1);
  }, [index]);

  return {
    items: state.items,
    status: state.status,
    error: state.error,
    notice: state.notice,
    pageSize,
    hasNext: state.status === "ready" && next.current !== undefined,
    hasPrev: index > 0,
    next: goNext,
    prev: () => setIndex((i) => Math.max(0, i - 1)),
    reload: () => {
      setTokens([undefined]);
      setIndex(0);
      setVersion((v) => v + 1);
    },
    setPageSize: (n: number) => {
      if (opts.preferences && opts.tableId) {
        writeTablePreferences(opts.preferences, opts.tableId, {
          ...readTablePreferences(opts.preferences, opts.tableId),
          pageSize: n,
        });
      }
      setTokens([undefined]);
      setIndex(0);
      setPageSizeState(n);
    },
  };
}
