import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { DraftStore } from "../../application/usecases/session/DraftStore.js";
import { AuthContext, type AuthServices } from "../auth/AuthContext.js";
import type { SecretInput } from "../components/index.js";
import { useDraft } from "./useDraft.js";

const wrap =
  (drafts: DraftStore) =>
  ({ children }: { children: ReactNode }) =>
    createElement(AuthContext.Provider, { value: { drafts } as unknown as AuthServices }, children);

/** Forces a value the types would refuse, to prove the run-time guard. */
const bad = (v: unknown) => v as { name: string };
const INITIAL = { name: "", rows: [{ k: "", v: "" }], size: "20" };

describe("useDraft (FR-004, D-1)", () => {
  it("starts from the initial value when no draft exists", () => {
    const { result } = renderHook(() => useDraft("t3:team_1", INITIAL), {
      wrapper: wrap(new DraftStore()),
    });
    expect(result.current.value).toEqual(INITIAL);
    expect(result.current.restored).toBe(false);
  });

  it("writes every change to the draft store and restores it after a remount", () => {
    const store = new DraftStore();
    const first = renderHook(() => useDraft("t3:team_1", INITIAL), { wrapper: wrap(store) });
    act(() => first.result.current.setValue((v) => ({ ...v, name: "patcher" })));
    first.unmount();
    expect(store.get("t3:team_1")).toBeDefined();

    const second = renderHook(() => useDraft("t3:team_1", INITIAL), { wrapper: wrap(store) });
    expect(second.result.current.value).toEqual({ ...INITIAL, name: "patcher" });
    expect(second.result.current.restored).toBe(true);
  });

  it("a restored draft takes defaults for fields it does not carry (the form gained a field)", () => {
    const store = new DraftStore();
    store.save("f", { json: JSON.stringify({ name: "old" }) });
    const { result } = renderHook(() => useDraft("f", INITIAL), { wrapper: wrap(store) });
    expect(result.current.value).toEqual({ ...INITIAL, name: "old" });
  });

  it("ignores a corrupt or foreign draft", () => {
    const store = new DraftStore();
    store.save("f", { json: "{not json" });
    const a = renderHook(() => useDraft("f", INITIAL), { wrapper: wrap(store) });
    expect(a.result.current.value).toEqual(INITIAL);
    expect(a.result.current.restored).toBe(false);
    store.save("g", { other: "x" });
    const b = renderHook(() => useDraft("g", INITIAL), { wrapper: wrap(store) });
    expect(b.result.current.value).toEqual(INITIAL);
  });

  it("discard removes the draft and later changes are not saved", () => {
    const store = new DraftStore();
    const { result } = renderHook(() => useDraft("f", INITIAL), { wrapper: wrap(store) });
    act(() => result.current.setValue((v) => ({ ...v, name: "x" })));
    expect(store.get("f")).toBeDefined();
    act(() => result.current.discard());
    expect(store.get("f")).toBeUndefined();
    act(() => result.current.setValue((v) => ({ ...v, name: "y" })));
    expect(store.get("f")).toBeUndefined();
  });

  it("drafts are per form id", () => {
    const store = new DraftStore();
    const a = renderHook(() => useDraft("a", INITIAL), { wrapper: wrap(store) });
    act(() => a.result.current.setValue((v) => ({ ...v, name: "only-a" })));
    const b = renderHook(() => useDraft("b", INITIAL), { wrapper: wrap(store) });
    expect(b.result.current.value.name).toBe("");
  });

  it("refuses a secret-backed value: a SecretInput handle or a secret-named field is never drafted", () => {
    const store = new DraftStore();
    const { result } = renderHook(() => useDraft<{ name: string }>("s", { name: "" }), {
      wrapper: wrap(store),
    });
    expect(() =>
      act(() =>
        result.current.setValue(bad({ name: "n", read: () => "hunter2", clear: () => {} })),
      ),
    ).toThrow(/secret/i);
    expect(() =>
      act(() => result.current.setValue(bad({ name: "n", secretValue: "hunter2" }))),
    ).toThrow(/secret/i);
    expect(() =>
      act(() => result.current.setValue(bad({ name: "n", password: "hunter2" }))),
    ).toThrow(/secret/i);
    expect(JSON.stringify(store.snapshot())).not.toContain("hunter2");
  });

  it("types reject a SecretInput handle", () => {
    // compile-time only: the call is never made
    const never = (h: React.ComponentRef<typeof SecretInput>) => {
      // @ts-expect-error a SecretInput handle is not a DraftValue
      useDraft("s", { field: h });
    };
    expect(never).toBeTypeOf("function");
  });

  it("without an auth context the hook keeps state in memory and persists nothing", () => {
    const { result } = renderHook(() => useDraft("f", INITIAL));
    act(() => result.current.setValue((v) => ({ ...v, name: "x" })));
    expect(result.current.value.name).toBe("x");
  });
});
