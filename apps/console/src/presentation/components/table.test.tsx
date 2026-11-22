import { act, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "../../../test/axe.js";
import type { PreferencesPort } from "../../application/ports/preferences.js";
import { Table, type TableColumn } from "./Table.js";
import { LIST_REFRESHED, useServerPages } from "./useServerPages.js";

interface Row {
  id: string;
  name: string;
  spend: number;
  kind: string;
}
const rows: Row[] = [
  { id: "t1", name: "Payments", spend: 30, kind: "persistent" },
  { id: "t2", name: "Search", spend: 10, kind: "ephemeral" },
  { id: "t3", name: "Billing", spend: 20, kind: "persistent" },
];
const columns: TableColumn<Row>[] = [
  {
    id: "name",
    header: "Name",
    cell: (r) => r.name,
    sortValue: (r) => r.name,
    alwaysVisible: true,
  },
  { id: "spend", header: "Spend", cell: (r) => `$${r.spend}`, sortValue: (r) => r.spend },
];
const names = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0]?.textContent);

function memoryPrefs(): PreferencesPort & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k),
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}

describe("Table (M0-U3)", () => {
  it("filters by text and by property, and sorts", async () => {
    const { container } = render(
      <Table
        id="t"
        caption="Teams"
        columns={columns}
        items={rows}
        getRowId={(r) => r.id}
        status="ready"
        propertyFilters={[
          {
            id: "kind",
            label: "Kind",
            options: [
              { value: "persistent", label: "Persistent" },
              { value: "ephemeral", label: "Ephemeral" },
            ],
            match: (r, v) => r.kind === v,
          },
        ]}
      />,
    );
    expect(names()).toEqual(["Payments", "Search", "Billing"]);
    await userEvent.type(screen.getByRole("searchbox"), "ing");
    expect(names()).toEqual(["Billing"]);
    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Kind" }), "persistent");
    expect(names()).toEqual(["Payments", "Billing"]);
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Billing", "Payments"]);
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(names()).toEqual(["Payments", "Billing"]);
    expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe(
      "descending",
    );
    await expectNoA11yViolations(container);
  });
  it("shows loading, error and empty states", () => {
    const { rerender } = render(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={[]}
        getRowId={(r) => r.id}
        status="loading"
      />,
    );
    expect(screen.getByText("Loading…")).toBeTruthy();
    rerender(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={[]}
        getRowId={(r) => r.id}
        status="error"
        error="Boom"
      />,
    );
    expect(screen.getByText("Boom")).toBeTruthy();
    rerender(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={[]}
        getRowId={(r) => r.id}
        status="ready"
        emptyText="No teams yet"
      />,
    );
    expect(screen.getByText("No teams yet")).toBeTruthy();
    rerender(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={[]}
        getRowId={(r) => r.id}
        status="error"
      />,
    );
    expect(screen.getByText("The list could not be loaded.")).toBeTruthy();
  });
  it("selects single and multiple rows", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={rows}
        getRowId={(r) => r.id}
        status="ready"
        selection={{ mode: "multi", selected: ["t1"], onChange }}
      />,
    );
    await userEvent.click(screen.getByLabelText("Select t2"));
    expect(onChange).toHaveBeenLastCalledWith(["t1", "t2"]);
    await userEvent.click(screen.getByLabelText("Select t1"));
    expect(onChange).toHaveBeenLastCalledWith([]);
    rerender(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={rows}
        getRowId={(r) => r.id}
        status="ready"
        selection={{ mode: "single", selected: [], onChange }}
      />,
    );
    await userEvent.click(screen.getByLabelText("Select t3"));
    expect(onChange).toHaveBeenLastCalledWith(["t3"]);
  });
  it("preferences: hides a column and remembers it through the port", async () => {
    const prefs = memoryPrefs();
    const pagination = {
      pageSize: 25,
      hasNext: true,
      hasPrev: false,
      onNext: vi.fn(),
      onPrev: vi.fn(),
      onPageSizeChange: vi.fn(),
    };
    const { unmount } = render(
      <Table
        id="teams"
        caption="c"
        columns={columns}
        items={rows}
        getRowId={(r) => r.id}
        status="ready"
        preferences={prefs}
        pagination={pagination}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Preferences" }));
    await userEvent.click(screen.getByLabelText("Spend"));
    await userEvent.selectOptions(screen.getByLabelText(/Page size/), "50");
    expect(pagination.onPageSizeChange).toHaveBeenCalledWith(50);
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("columnheader", { name: "Spend" })).toBeNull();
    expect(JSON.parse(prefs.data.get("afs.table.teams") ?? "{}")).toEqual({
      hiddenColumns: ["spend"],
    });
    unmount();
    render(
      <Table
        id="teams"
        caption="c"
        columns={columns}
        items={rows}
        getRowId={(r) => r.id}
        status="ready"
        preferences={prefs}
      />,
    );
    expect(screen.queryByRole("columnheader", { name: "Spend" })).toBeNull();
  });
  it("pagination buttons follow hasNext and hasPrev", async () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    render(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={rows}
        getRowId={(r) => r.id}
        status="ready"
        pagination={{
          pageSize: 10,
          hasNext: true,
          hasPrev: false,
          onNext,
          onPrev,
          onPageSizeChange: vi.fn(),
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Previous page" }).getAttribute("aria-disabled"),
    ).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onNext).toHaveBeenCalled();
  });
  it("shows a notice", () => {
    render(
      <Table
        id="t"
        caption="c"
        columns={columns}
        items={rows}
        getRowId={(r) => r.id}
        status="ready"
        notice="The list was refreshed"
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("The list was refreshed");
  });
});

describe("useServerPages (M0-U3)", () => {
  const pages: Record<string, { items: string[]; nextToken?: string }> = {
    first: { items: ["a"], nextToken: "p2" },
    p2: { items: ["b"], nextToken: "p3" },
    p3: { items: ["c"] },
  };
  it("pages forward and back with maxResults/nextToken", async () => {
    const load = vi.fn(
      async (r: { nextToken?: string; maxResults: number }) =>
        pages[r.nextToken ?? "first"] as { items: string[]; nextToken?: string },
    );
    const { result } = renderHook(() => useServerPages<string>({ load, defaultPageSize: 5 }));
    await waitFor(() => expect(result.current.items).toEqual(["a"]));
    expect(load.mock.calls[0]?.[0].maxResults).toBe(5);
    expect(result.current.hasNext).toBe(true);
    expect(result.current.hasPrev).toBe(false);
    act(() => result.current.next());
    await waitFor(() => expect(result.current.items).toEqual(["b"]));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.items).toEqual(["c"]));
    expect(result.current.hasNext).toBe(false);
    act(() => result.current.prev());
    await waitFor(() => expect(result.current.items).toEqual(["b"]));
    expect(load.mock.calls.at(-1)?.[0].nextToken).toBe("p2");
  });
  it("an expired token restarts from the first page with a notice", async () => {
    let calls = 0;
    const load = vi.fn(async (r: { nextToken?: string }) => {
      calls++;
      if (r.nextToken === "p2" && calls === 2) throw new Error("expired");
      return (pages[r.nextToken ?? "first"] ?? pages.first) as {
        items: string[];
        nextToken?: string;
      };
    });
    const { result } = renderHook(() =>
      useServerPages<string>({ load, isInvalidToken: (e) => (e as Error).message === "expired" }),
    );
    await waitFor(() => expect(result.current.items).toEqual(["a"]));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.notice).toBe(LIST_REFRESHED));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toEqual(["a"]);
    expect(result.current.hasPrev).toBe(false);
  });
  it("a failure on the first page is an error; reload retries", async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new Error("down");
      return { items: ["ok"] };
    });
    const { result } = renderHook(() => useServerPages<string>({ load }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    fail = false;
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.items).toEqual(["ok"]));
  });
  it("page size comes from and goes to preferences, and restarts the list", async () => {
    const prefs = memoryPrefs();
    prefs.set("afs.table.x", JSON.stringify({ pageSize: 50 }));
    const load = vi.fn(async (_r: { maxResults: number }) => ({ items: ["a"] }));
    const { result } = renderHook(() =>
      useServerPages<string>({ load, preferences: prefs, tableId: "x" }),
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.pageSize).toBe(50);
    expect(load.mock.calls[0]?.[0]).toMatchObject({ maxResults: 50 });
    act(() => result.current.setPageSize(10));
    await waitFor(() => expect(load.mock.calls.at(-1)?.[0]).toMatchObject({ maxResults: 10 }));
    expect(JSON.parse(prefs.data.get("afs.table.x") ?? "{}").pageSize).toBe(10);
  });
});
