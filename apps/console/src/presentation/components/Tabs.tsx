import { type ReactNode, useId, useRef, useState } from "react";
import s from "./ui.module.css";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/** APG tabs: arrow keys move and activate, Home/End jump; only the active panel renders. */
export function Tabs({
  tabs,
  activeId,
  onChange,
  label,
}: {
  tabs: readonly TabItem[];
  activeId?: string;
  onChange?: (id: string) => void;
  label: string;
}) {
  const base = useId();
  const [own, setOwn] = useState(tabs[0]?.id);
  const current = activeId ?? own;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const select = (id: string) => {
    setOwn(id);
    onChange?.(id);
    refs.current[id]?.focus();
  };
  const onKey = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === current);
    const n = tabs.length;
    let next: number | undefined;
    if (e.key === "ArrowRight") next = (i + 1) % n;
    else if (e.key === "ArrowLeft") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === undefined) return;
    e.preventDefault();
    select(tabs[next]?.id as string);
  };
  const active = tabs.find((t) => t.id === current);
  return (
    <div>
      <div role="tablist" aria-label={label} className={s.tablist} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === current}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === current ? 0 : -1}
            className={s.tab}
            onClick={() => select(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {active && (
        <div
          role="tabpanel"
          id={`${base}-panel-${active.id}`}
          aria-labelledby={`${base}-tab-${active.id}`}
        >
          {active.content}
        </div>
      )}
    </div>
  );
}
