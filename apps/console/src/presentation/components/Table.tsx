import { type ReactNode, useId, useMemo, useState } from "react";
import {
  type PreferencesPort,
  readTablePreferences,
  writeTablePreferences,
} from "../../application/ports/preferences.js";
import { Button } from "./Button.js";
import { Modal } from "./Modal.js";
import s from "./ui.module.css";

export interface TableColumn<T> {
  id: string;
  header: string;
  cell: (item: T) => ReactNode;
  /** Enables sorting on this column. */
  sortValue?: (item: T) => string | number;
  /** Text matched by the filter; defaults to the sort value. */
  text?: (item: T) => string;
  alwaysVisible?: boolean;
  /** Hidden until the person turns it on in preferences. */
  defaultHidden?: boolean;
}

export interface PropertyFilter<T> {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
  match: (item: T, value: string) => boolean;
}

export interface TableProps<T> {
  id: string;
  caption: string;
  columns: readonly TableColumn<T>[];
  items: readonly T[];
  getRowId: (item: T) => string;
  status?: "loading" | "ready" | "error";
  error?: ReactNode;
  emptyText?: string;
  notice?: string | undefined;
  filterLabel?: string;
  propertyFilters?: readonly PropertyFilter<T>[];
  selection?: {
    mode: "single" | "multi";
    selected: readonly string[];
    onChange: (ids: string[]) => void;
  };
  pagination?: {
    pageSize: number;
    pageSizes?: readonly number[];
    hasNext: boolean;
    hasPrev: boolean;
    onNext: () => void;
    onPrev: () => void;
    onPageSizeChange: (n: number) => void;
  };
  preferences?: PreferencesPort;
}

/** A table with text and property filters, sorting, selection, server pagination and preferences (WEB-5). */
export function Table<T>(p: TableProps<T>) {
  const [filter, setFilter] = useState("");
  const [props, setProps] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | undefined>();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>(
    () =>
      (p.preferences ? readTablePreferences(p.preferences, p.id).hiddenColumns : undefined) ??
      p.columns.filter((c) => c.defaultHidden).map((c) => c.id),
  );
  const filterId = useId();
  const cols = p.columns.filter((c) => c.alwaysVisible || !hidden.includes(c.id));

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = p.items.filter((it) => {
      if (q) {
        const hay = p.columns
          .map((c) => (c.text ? c.text(it) : c.sortValue ? String(c.sortValue(it)) : ""))
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return (p.propertyFilters ?? []).every(
        (f) => !props[f.id] || f.match(it, props[f.id] as string),
      );
    });
    const col = sort && p.columns.find((c) => c.id === sort.id);
    if (sort && col?.sortValue) {
      const sv = col.sortValue;
      out = [...out].sort((a, b) => {
        const x = sv(a);
        const y = sv(b);
        const r = x < y ? -1 : x > y ? 1 : 0;
        return sort.dir === "asc" ? r : -r;
      });
    }
    return out;
  }, [p.items, p.columns, p.propertyFilters, filter, props, sort]);

  const sel = p.selection;
  const toggle = (id: string) => {
    if (!sel) return;
    if (sel.mode === "single") sel.onChange([id]);
    else
      sel.onChange(
        sel.selected.includes(id) ? sel.selected.filter((x) => x !== id) : [...sel.selected, id],
      );
  };
  const colSpan = cols.length + (sel ? 1 : 0);

  return (
    <div className={s.card}>
      <div className={s.tools}>
        <label htmlFor={filterId} className="sr-only">
          {p.filterLabel ?? "Filter"}
        </label>
        <input
          id={filterId}
          type="search"
          className={s.input}
          placeholder={p.filterLabel ?? "Filter"}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {(p.propertyFilters ?? []).map((f) => (
          <label key={f.id}>
            <span className="sr-only">{f.label}</span>
            <select
              className={s.input}
              value={props[f.id] ?? ""}
              onChange={(e) => setProps({ ...props, [f.id]: e.target.value })}
            >
              <option value="">{f.label}: all</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Button aria-label="Preferences" onClick={() => setPrefsOpen(true)}>
          Preferences
        </Button>
        {p.pagination && (
          <div className={s.pager}>
            <Button
              disabled={!p.pagination.hasPrev}
              aria-label="Previous page"
              onClick={p.pagination.onPrev}
            >
              ‹
            </Button>
            <Button
              disabled={!p.pagination.hasNext}
              aria-label="Next page"
              onClick={p.pagination.onNext}
            >
              ›
            </Button>
          </div>
        )}
      </div>
      {p.notice && (
        <div role="status" className={`${s.hint} ${s.notice}`}>
          {p.notice}
        </div>
      )}
      <table aria-busy={p.status === "loading" || undefined}>
        <caption className="sr-only">{p.caption}</caption>
        <thead>
          <tr>
            {sel && (
              <th className={s.th} scope="col">
                <span className="sr-only">Select</span>
              </th>
            )}
            {cols.map((c) => (
              <th
                key={c.id}
                scope="col"
                className={s.th}
                aria-sort={
                  sort?.id === c.id ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
                }
              >
                {c.sortValue ? (
                  <button
                    type="button"
                    className={`${s.btn} ${s.link}`}
                    onClick={() =>
                      setSort(
                        sort?.id === c.id && sort.dir === "asc"
                          ? { id: c.id, dir: "desc" }
                          : { id: c.id, dir: "asc" },
                      )
                    }
                  >
                    {c.header}
                  </button>
                ) : (
                  c.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.status === "loading" && (
            <tr>
              <td className={s.td} colSpan={colSpan}>
                Loading…
              </td>
            </tr>
          )}
          {p.status === "error" && (
            <tr>
              <td className={s.td} colSpan={colSpan}>
                {p.error ?? "The list could not be loaded."}
              </td>
            </tr>
          )}
          {p.status !== "loading" && p.status !== "error" && rows.length === 0 && (
            <tr>
              <td className={s.td} colSpan={colSpan}>
                {p.emptyText ?? "Nothing to show."}
              </td>
            </tr>
          )}
          {p.status !== "loading" &&
            p.status !== "error" &&
            rows.map((it) => {
              const id = p.getRowId(it);
              const checked = sel?.selected.includes(id) ?? false;
              return (
                <tr
                  key={id}
                  className={checked ? s.selected : undefined}
                  aria-selected={sel ? checked : undefined}
                >
                  {sel && (
                    <td className={s.td}>
                      <input
                        type={sel.mode === "single" ? "radio" : "checkbox"}
                        name={`${p.id}-select`}
                        aria-label={`Select ${id}`}
                        checked={checked}
                        onChange={() => toggle(id)}
                      />
                    </td>
                  )}
                  {cols.map((c) => (
                    <td key={c.id} className={s.td}>
                      {c.cell(it)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
      {prefsOpen && (
        <Modal
          title="Preferences"
          onClose={() => setPrefsOpen(false)}
          actions={
            <Button variant="primary" onClick={() => setPrefsOpen(false)}>
              Done
            </Button>
          }
        >
          {p.pagination && (
            <label>
              Page size{" "}
              <select
                className={s.input}
                value={p.pagination.pageSize}
                onChange={(e) => p.pagination?.onPageSizeChange(Number(e.target.value))}
              >
                {(p.pagination.pageSizes ?? [10, 25, 50, 100]).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend>Columns</legend>
            {p.columns.map((c) => (
              <label key={c.id} className={s.block}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(c.id)}
                  disabled={c.alwaysVisible}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? hidden.filter((h) => h !== c.id)
                      : [...hidden, c.id];
                    setHidden(next);
                    if (p.preferences)
                      writeTablePreferences(p.preferences, p.id, {
                        ...readTablePreferences(p.preferences, p.id),
                        hiddenColumns: next,
                      });
                  }}
                />{" "}
                {c.header}
              </label>
            ))}
          </fieldset>
        </Modal>
      )}
    </div>
  );
}
