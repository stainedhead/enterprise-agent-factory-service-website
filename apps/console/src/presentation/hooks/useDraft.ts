import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { AuthContext } from "../auth/AuthContext.js";

/**
 * What a draft may hold: JSON data only. A function-bearing value (a `SecretInput` handle, a callback) maps
 * to `never` in this type, so passing one is a type error (FR-004: secrets are never drafted). Interfaces
 * qualify, which an index-signature type would not allow.
 */
export type Draftable<T> = T extends string | number | boolean | null
  ? T
  : T extends (...args: never[]) => unknown
    ? never
    : T extends readonly (infer U)[]
      ? readonly Draftable<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Draftable<T[K]> }
        : never;

/** Field names that look like they carry a secret; a draft holding one is refused at run time. */
const SECRET_KEY = /^(secret|secretValue|secret_string|password|passwd|plaintext|token|apiKey)$/i;

/** Throws when `v` is not plain JSON data or has a secret-named field; the message never contains a value. */
export function assertDraftable(v: unknown, path = "draft"): void {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean")
    return;
  if (Array.isArray(v)) {
    for (const [i, x] of v.entries()) assertDraftable(x, `${path}[${i}]`);
    return;
  }
  const proto = typeof v === "object" ? Object.getPrototypeOf(v) : undefined;
  if (typeof v !== "object" || (proto !== Object.prototype && proto !== null))
    throw new TypeError(`${path} is not plain data; a secret input or handle is never drafted`);
  for (const [k, x] of Object.entries(v)) {
    if (SECRET_KEY.test(k))
      throw new TypeError(`${path}.${k} looks like a secret and is never drafted`);
    assertDraftable(x, `${path}.${k}`);
  }
}

/** Where drafts live: one JSON string per form, under one key of the session's `DraftStore`. */
const KEY = "json";

function read<T>(
  drafts: { get(id: string): Record<string, string> | undefined } | undefined,
  formId: string,
  initial: T,
): { value: T; restored: boolean } {
  const raw = drafts?.get(formId)?.[KEY];
  if (raw === undefined) return { value: initial, restored: false };
  try {
    const parsed: unknown = JSON.parse(raw);
    assertDraftable(parsed);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed))
      return { value: initial, restored: false };
    // fields the form gained since the draft was saved keep their defaults
    return { value: { ...(initial as object), ...parsed } as T, restored: true };
  } catch {
    return { value: initial, restored: false };
  }
}

export interface DraftHandle<T> {
  readonly value: T;
  readonly setValue: Dispatch<SetStateAction<T>>;
  /** True when the first render started from a saved draft. */
  readonly restored: boolean;
  /** Drops the draft and stops saving; call on submit success and on cancel. */
  readonly discard: () => void;
}

/**
 * Form state that survives a session expiry (WEB-US-7.7, FR-004). Every change is saved to the session's
 * `DraftStore` (memory; it rides through the re-authentication redirect in `sessionStorage` and is removed on
 * boot and on sign-out). Only non-secret data is accepted: secret values stay in `SecretInput` refs.
 * Without an auth context the hook is plain state and persists nothing.
 */
export function useDraft<T>(formId: string, initial: T & Draftable<T>): DraftHandle<T> {
  const drafts = useContext(AuthContext)?.drafts;
  const [start] = useState(() => read<T>(drafts, formId, initial));
  const [value, setState] = useState<T>(start.value);
  const current = useRef<T>(start.value);
  const active = useRef(true);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (u) => {
      const next = typeof u === "function" ? (u as (p: T) => T)(current.current) : u;
      assertDraftable(next);
      current.current = next;
      setState(next);
      if (active.current) drafts?.save(formId, { [KEY]: JSON.stringify(next) });
    },
    [drafts, formId],
  );
  const discard = useCallback(() => {
    active.current = false;
    drafts?.discard(formId);
  }, [drafts, formId]);

  return { value, setValue, restored: start.restored, discard };
}
