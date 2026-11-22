import { useCallback, useRef, useState } from "react";
import { isAppError } from "../../application/errors.js";
import { useErrorReporter } from "../query/errorReporter.js";

export interface VersionedResource {
  readonly version: number;
}

export interface VersionedFormOptions<R extends VersionedResource, D> {
  /** The resource as loaded; the form's baseline. */
  readonly initial: R;
  readonly toDraft: (r: R) => D;
  /** Saves the draft against `version` (sent as `If-Match`). */
  readonly save: (draft: D, version: number) => Promise<R>;
  /** Fetches the current resource (after a `412`). */
  readonly reload: () => Promise<R>;
  readonly onSaved?: (r: R) => void;
}

export interface VersionedForm<R extends VersionedResource, D> {
  readonly draft: D;
  setDraft(next: D | ((d: D) => D)): void;
  readonly version: number;
  /** Set after a `412`: the server's newer copy, shown beside the draft once reloaded. */
  readonly stale: boolean;
  readonly current: R | undefined;
  readonly saving: boolean;
  readonly error: unknown;
  /** Field messages of a `ValidationError`. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  submit(): Promise<R | undefined>;
  /** Loads the newer copy and the new version; the draft is kept. */
  reload(): Promise<void>;
}

/**
 * Form state with optimistic concurrency (WEB-US-10.1, WEB-11): a `412` keeps the user's edits, offers
 * *Reload*, and the next save uses the reloaded version, never silently.
 */
export function useVersionedForm<R extends VersionedResource, D>(
  o: VersionedFormOptions<R, D>,
): VersionedForm<R, D> {
  const [draft, setDraft] = useState<D>(() => o.toDraft(o.initial));
  const [version, setVersion] = useState(o.initial.version);
  const [stale, setStale] = useState(false);
  const [current, setCurrent] = useState<R | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const opts = useRef(o);
  opts.current = o;
  const report = useErrorReporter();
  const reportRef = useRef(report);
  reportRef.current = report;

  const submit = useCallback(async () => {
    if (stale) return undefined; // the user must reload first
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const saved = await opts.current.save(draft, version);
      setVersion(saved.version);
      opts.current.onSaved?.(saved);
      return saved;
    } catch (e) {
      if (isAppError(e) && e.kind === "stale") setStale(true);
      else if (isAppError(e) && e.kind === "validation") setFieldErrors({ ...e.fields });
      setError(e);
      reportRef.current(e); // AccessDenied alert, 401 expiry, global notices (FR-002)
      return undefined;
    } finally {
      setSaving(false);
    }
  }, [draft, version, stale]);

  const reload = useCallback(async () => {
    try {
      const r = await opts.current.reload();
      setCurrent(r);
      setVersion(r.version);
      setStale(false);
      setError(undefined);
    } catch (e) {
      setError(e);
      reportRef.current(e);
    }
  }, []);

  return { draft, setDraft, version, stale, current, saving, error, fieldErrors, submit, reload };
}
