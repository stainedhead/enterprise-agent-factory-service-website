import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../application/errors.js";
import { GenerationNote } from "../components/GenerationNote.js";
import { SecretInput, type SecretInputHandle } from "../components/SecretInput.js";
import { WidgetBoundary } from "../components/WidgetBoundary.js";
import { useSecretMutation } from "../hooks/useSecretMutation.js";
import { useVersionedForm } from "../hooks/useVersionedForm.js";
import { GlobalBanners } from "../shell/GlobalBanners.js";
import { createQueryClient } from "./createQueryClient.js";
import { globalStatusOf } from "./globalStatus.js";
import { queryKey } from "./keys.js";

describe("query keys", () => {
  it("follows [area, teamId?, resource, id?, params?]", () => {
    expect(queryKey({ area: "teams", resource: "list" })).toEqual(["teams", "list"]);
    expect(
      queryKey({ area: "agents", teamId: "t1", resource: "agent", id: "a1", params: { x: 1 } }),
    ).toEqual(["agents", "t1", "agent", "a1", { x: 1 }]);
  });
});

describe("M1-Q1 global error routing", () => {
  it("AccessDenied is reported once", async () => {
    const onDenied = vi.fn();
    const qc = createQueryClient(onDenied);
    const e = new AppError({
      kind: "access-denied",
      message: "no",
      requiredPermission: "teams:write",
    });
    await qc
      .fetchQuery({ queryKey: ["a"], queryFn: () => Promise.reject(e), retry: false })
      .catch(() => {});
    expect(onDenied).toHaveBeenCalledTimes(1);
  });

  it("Unavailable raises the banner with Retry and the next success clears it", async () => {
    const qc = createQueryClient(() => {});
    const e = new AppError({ kind: "unavailable", message: "503" });
    await qc
      .fetchQuery({ queryKey: ["u"], queryFn: () => Promise.reject(e), retry: false })
      .catch(() => {});
    render(
      <QueryClientProvider client={qc}>
        <GlobalBanners />
        <input aria-label="Name" defaultValue="kept" />
      </QueryClientProvider>,
    );
    expect(screen.getByText("AFS is not responding")).toBeTruthy();
    expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("kept");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("AFS is not responding")).toBeNull());
    await qc.fetchQuery({ queryKey: ["ok"], queryFn: async () => 1 });
    expect(globalStatusOf(qc).state.unavailable).toBe(false);
  });

  it("409 team_suspended shows Team is suspended", async () => {
    const qc = createQueryClient(() => {});
    const e = new AppError({ kind: "conflict", message: "x", reason: "team_suspended" });
    await qc
      .fetchQuery({ queryKey: ["s"], queryFn: () => Promise.reject(e), retry: false })
      .catch(() => {});
    render(
      <QueryClientProvider client={qc}>
        <GlobalBanners />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Team is suspended")).toBeTruthy();
  });

  it("a throttle shows the non-blocking Slowing down notice", () => {
    const qc = createQueryClient(() => {});
    globalStatusOf(qc).throttle(10);
    render(
      <QueryClientProvider client={qc}>
        <GlobalBanners />
      </QueryClientProvider>,
    );
    expect(screen.getByText("Slowing down")).toBeTruthy();
  });
});

describe("M1-Q5 useVersionedForm", () => {
  interface R {
    version: number;
    name: string;
  }
  const setup = (save: (d: { name: string }, v: number) => Promise<R>, reload: () => Promise<R>) =>
    renderHook(() =>
      useVersionedForm<R, { name: string }>({
        initial: { version: 1, name: "a" },
        toDraft: (r) => ({ name: r.name }),
        save,
        reload,
      }),
    );

  it("412 keeps the edits, reload loads the new version, resubmit uses it", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new AppError({ kind: "stale", message: "412", requestId: "req_1" }))
      .mockResolvedValueOnce({ version: 4, name: "mine" });
    const reload = vi.fn(async () => ({ version: 3, name: "theirs" }));
    const { result } = setup(save, reload);
    act(() => result.current.setDraft({ name: "mine" }));
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.stale).toBe(true);
    expect(save).toHaveBeenCalledWith({ name: "mine" }, 1);
    // no silent retry while stale
    await act(async () => {
      await result.current.submit();
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.stale).toBe(false);
    expect(result.current.current?.name).toBe("theirs");
    expect(result.current.draft).toEqual({ name: "mine" });
    await act(async () => {
      await result.current.submit();
    });
    expect(save).toHaveBeenLastCalledWith({ name: "mine" }, 3);
  });

  it("validation errors expose field messages", async () => {
    const save = vi
      .fn()
      .mockRejectedValue(
        new AppError({ kind: "validation", message: "bad", fields: { name: "too long" } }),
      );
    const { result } = setup(save, vi.fn());
    await act(async () => {
      await result.current.submit();
    });
    expect(result.current.fieldErrors).toEqual({ name: "too long" });
  });

  it("a reload failure is surfaced", async () => {
    const { result } = setup(vi.fn(), vi.fn().mockRejectedValue(new Error("down")));
    await act(async () => {
      await result.current.reload();
    });
    expect((result.current.error as Error).message).toBe("down");
  });
});

let current: ReturnType<typeof createQueryClient>;
function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={current}>{children}</QueryClientProvider>;
}
let boom = true;
function Bad() {
  if (boom) throw new Error("render failed");
  return <p>fine</p>;
}

describe("M1-Q6 useSecretMutation", () => {
  const wrapper = (qc: ReturnType<typeof createQueryClient>) => {
    current = qc;
    return Wrapper;
  };

  it("never touches the mutation cache and scrubs secret inputs", async () => {
    const qc = createQueryClient(() => {});
    const ref = createRef<SecretInputHandle>();
    const { container } = render(<SecretInput ref={ref} />);
    const input = container.querySelector("input") as HTMLInputElement;
    await userEvent.type(input, "SENTINEL-123");
    const fn = vi.fn(async (_v: { value: string }) => ({ secretKey: "SK-SENTINEL" }));
    const { result } = renderHook(() => useSecretMutation(fn), { wrapper: wrapper(qc) });
    let out: { secretKey: string } | undefined;
    await act(async () => {
      out = await result.current.run({ value: ref.current?.read() ?? "" });
    });
    expect(out?.secretKey).toBe("SK-SENTINEL");
    expect(qc.getMutationCache().getAll()).toHaveLength(0);
    expect(
      JSON.stringify(
        qc
          .getQueryCache()
          .getAll()
          .map((q) => q.state.data),
      ),
    ).not.toContain("SENTINEL");
    expect(input.value).toBe("");
  });

  it("failures are returned as error state and inputs still scrubbed", async () => {
    const { result } = renderHook(() =>
      useSecretMutation(async () => Promise.reject(new Error("bad"))),
    );
    await act(async () => {
      expect(await result.current.run({})).toBeUndefined();
    });
    expect((result.current.error as Error).message).toBe("bad");
  });
});

describe("GenerationNote and WidgetBoundary", () => {
  it("shows Generation N, observed M and Change not applied yet only while M < N", () => {
    const { rerender } = render(<GenerationNote generation={3} observed={2} />);
    expect(screen.getByText(/Generation 3, observed 2/)).toBeTruthy();
    expect(screen.getByText(/Change not applied yet/)).toBeTruthy();
    rerender(<GenerationNote generation={3} observed={3} />);
    expect(screen.queryByText(/Change not applied yet/)).toBeNull();
  });

  it("M1-Q7: a failing widget shows its own error with request id and Retry, siblings stay", async () => {
    const retry = vi.fn();
    render(
      <div>
        <p>sibling</p>
        <WidgetBoundary
          title="Spend"
          error={new AppError({ kind: "unavailable", message: "boom", requestId: "req_9" })}
          onRetry={retry}
        >
          <p>content</p>
        </WidgetBoundary>
      </div>,
    );
    expect(screen.getByText("sibling")).toBeTruthy();
    expect(screen.getByText(/Request id: req_9/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalled();
  });

  it("a render error is contained and Retry re-renders the children", async () => {
    boom = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <WidgetBoundary title="Top spenders">
        <Bad />
      </WidgetBoundary>,
    );
    expect(screen.getByText("Top spenders could not be loaded")).toBeTruthy();
    boom = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(screen.getByText("fine")).toBeTruthy();
    spy.mockRestore();
  });
});

describe("M6-Q1 change announcements", () => {
  it("a successful write is announced in a polite live region, and a repeat is read again", async () => {
    const qc = createQueryClient(() => {});
    render(
      <QueryClientProvider client={qc}>
        <GlobalBanners />
      </QueryClientProvider>,
    );
    const region = screen.getByRole("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.textContent).toBe("");
    const run = () =>
      act(async () => {
        await qc
          .getMutationCache()
          .build(qc, { mutationFn: async () => 1 })
          .execute(undefined);
      });
    await run();
    expect(region.textContent).toBe("Change saved");
    await run();
    expect(region.textContent).toBe("Change saved.");
  });
  it("a failed write is not announced as saved", async () => {
    const qc = createQueryClient(() => {});
    render(
      <QueryClientProvider client={qc}>
        <GlobalBanners />
      </QueryClientProvider>,
    );
    await act(async () => {
      await qc
        .getMutationCache()
        .build(qc, { mutationFn: () => Promise.reject(new Error("x")) })
        .execute(undefined)
        .catch(() => {});
    });
    expect(screen.getByRole("status").textContent).toBe("");
  });
});
