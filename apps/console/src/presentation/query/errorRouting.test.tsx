import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../application/errors.js";
import { useSecretMutation } from "../hooks/useSecretMutation.js";
import { useVersionedForm } from "../hooks/useVersionedForm.js";
import { createQueryClient } from "./createQueryClient.js";

const SECRET = "s3ntinel-never-reported";
const denied = () =>
  new AppError({
    kind: "access-denied",
    message: "denied",
    requestId: "req_9",
    requiredPermission: "secrets:write",
  });
const unauthenticated = () => new AppError({ kind: "unauthenticated", message: "expired" });

const wrapperFor =
  (qc: ReturnType<typeof createQueryClient>) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );

describe("FR-002 the bypass hooks report to the shared reporter", () => {
  it("useSecretMutation reports an AccessDenied, and only the AppError", async () => {
    const onDenied = vi.fn();
    const qc = createQueryClient(onDenied);
    const { result } = renderHook(
      () => useSecretMutation(async (_v: { value: string }) => Promise.reject(denied())),
      { wrapper: wrapperFor(qc) },
    );
    await act(async () => {
      await result.current.run({ value: SECRET });
    });
    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(onDenied.mock.calls[0]).toHaveLength(1);
    expect(onDenied.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
    expect(JSON.stringify(onDenied.mock.calls)).not.toContain(SECRET);
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
  });

  it("useVersionedForm reports an AccessDenied from save", async () => {
    const onDenied = vi.fn();
    const qc = createQueryClient(onDenied);
    const { result } = renderHook(
      () =>
        useVersionedForm<{ version: number }, { a: string }>({
          initial: { version: 1 },
          toDraft: () => ({ a: "x" }),
          save: () => Promise.reject(denied()),
          reload: async () => ({ version: 1 }),
        }),
      { wrapper: wrapperFor(qc) },
    );
    await act(async () => {
      await result.current.submit();
    });
    expect(onDenied).toHaveBeenCalledTimes(1);
    expect(onDenied.mock.calls[0]?.[0]).toBeInstanceOf(AppError);
    expect(result.current.error).toBeInstanceOf(AppError);
  });

  it("a non-AppError is not reported", async () => {
    const onDenied = vi.fn();
    const qc = createQueryClient(onDenied);
    const { result } = renderHook(
      () => useSecretMutation(async () => Promise.reject(new Error("boom"))),
      { wrapper: wrapperFor(qc) },
    );
    await act(async () => {
      await result.current.run(undefined);
    });
    expect(onDenied).not.toHaveBeenCalled();
  });

  it("the hooks work without a query client (no reporter)", async () => {
    const { result } = renderHook(() => useSecretMutation(async () => Promise.reject(denied())));
    await act(async () => {
      await result.current.run(undefined);
    });
    expect(result.current.error).toBeInstanceOf(AppError);
  });
});

describe("FR-003 onUnauthenticated", () => {
  const make = () => {
    const onUnauthenticated = vi.fn();
    const qc = createQueryClient(() => {}, undefined, { onUnauthenticated });
    return { qc, onUnauthenticated };
  };

  it("fires once for a query, however often it fails", async () => {
    const { qc, onUnauthenticated } = make();
    const fn = vi.fn(() => Promise.reject(unauthenticated()));
    // the default retry predicate does not retry `unauthenticated`: one request, one signal
    await qc.fetchQuery({ queryKey: ["a"], queryFn: fn }).catch(() => {});
    expect(fn).toHaveBeenCalledTimes(1);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    await qc.fetchQuery({ queryKey: ["b"], queryFn: fn }).catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("fires for a cache mutation", async () => {
    const { qc, onUnauthenticated } = make();
    await qc
      .getMutationCache()
      .build(qc, { mutationFn: () => Promise.reject(unauthenticated()) })
      .execute(undefined)
      .catch(() => {});
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it("fires for each bypass hook", async () => {
    for (const run of ["secret", "form"] as const) {
      const { qc, onUnauthenticated } = make();
      const { result } = renderHook(
        () => ({
          s: useSecretMutation(async () => Promise.reject(unauthenticated())),
          f: useVersionedForm<{ version: number }, { a: string }>({
            initial: { version: 1 },
            toDraft: () => ({ a: "x" }),
            save: () => Promise.reject(unauthenticated()),
            reload: async () => ({ version: 1 }),
          }),
        }),
        { wrapper: wrapperFor(qc) },
      );
      await act(async () => {
        if (run === "secret") await result.current.s.run(undefined);
        else await result.current.f.submit();
      });
      expect(onUnauthenticated, run).toHaveBeenCalledTimes(1);
    }
  });

  it("sends no further request for any query while expired (no retry storm)", async () => {
    const { qc } = make();
    const calls = { dead: 0, other: 0, later: 0 };
    const { result, rerender } = renderHook(
      ({ later }: { later: boolean }) => ({
        dead: useQuery({
          queryKey: ["dead"],
          queryFn: async () => {
            calls.dead++;
            throw unauthenticated();
          },
        }),
        other: useQuery({
          queryKey: ["other"],
          queryFn: async () => {
            calls.other++;
            return "ok";
          },
        }),
        later: useQuery({
          queryKey: ["later"],
          enabled: later,
          queryFn: async () => {
            calls.later++;
            return "ok";
          },
        }),
      }),
      { wrapper: wrapperFor(qc), initialProps: { later: false } },
    );
    await waitFor(() => expect(result.current.dead.isError).toBe(true));
    expect(calls.dead).toBe(1);
    const other = calls.other;
    await act(async () => {
      await qc.invalidateQueries();
      await qc.refetchQueries();
    });
    rerender({ later: true });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(calls.dead).toBe(1);
    expect(calls.other).toBe(other);
    expect(calls.later).toBe(0);
  });

  it("defaults to a no-op", async () => {
    const qc = createQueryClient(() => {});
    await qc
      .fetchQuery({ queryKey: ["a"], queryFn: () => Promise.reject(unauthenticated()) })
      .catch(() => {});
  });
});
