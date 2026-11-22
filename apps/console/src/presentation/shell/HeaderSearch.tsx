import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { SearchEntry, SearchGroup, SearchType } from "../../domain/search.js";
import { filterSearch, MIN_QUERY } from "../../domain/search.js";
import { useMe, useShell } from "./ShellContext.js";
import s from "./shell.module.css";

const TITLES: Record<SearchType, string> = {
  team: "Teams",
  agent: "Agents",
  pool: "Pools",
  "work-order": "Work orders",
};

/** Header search: `/` focuses it; matches are filtered locally from list calls; Enter opens (D44). */
export function HeaderSearch() {
  const { searchIndex } = useShell();
  const me = useMe();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState<readonly SearchEntry[] | undefined>();
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const loading = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        e.key === "/" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? "") &&
        !t?.isContentEditable
      ) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // The lists are loaded the first time a query is long enough, never on mount (no calls while idle).
  useEffect(() => {
    if (q.trim().length < MIN_QUERY || index || loading.current) return;
    loading.current = true;
    void searchIndex.execute(undefined, me).then(setIndex);
  }, [q, index, searchIndex, me]);

  const groups: SearchGroup[] = index ? filterSearch(index, q) : [];
  const flat = groups.flatMap((g) => g.entries);
  const open = q.trim().length >= MIN_QUERY;

  const choose = (e: SearchEntry) => {
    setQ("");
    navigate(e.route);
  };

  return (
    <search className={s.search}>
      <input
        ref={input}
        type="search"
        aria-label="Search"
        placeholder="Search (press /)"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, flat.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && flat[active]) choose(flat[active] as SearchEntry);
          else if (e.key === "Escape") setQ("");
        }}
      />
      {open && (
        <div id={listId} role="listbox" aria-label="Search results" className={s.results}>
          {!index && <p className={s.empty}>Searching…</p>}
          {index && flat.length === 0 && <p className={s.empty}>No matches</p>}
          {groups.map((g) => (
            <div key={g.type} role="group" aria-label={TITLES[g.type]}>
              <h3>{TITLES[g.type]}</h3>
              {g.entries.map((e) => (
                <div
                  key={`${e.type}:${e.id}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={flat[active] === e}
                >
                  <Link to={e.route} onClick={() => setQ("")}>
                    {e.label}
                  </Link>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </search>
  );
}
