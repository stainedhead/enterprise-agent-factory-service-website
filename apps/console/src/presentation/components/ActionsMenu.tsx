import { useEffect, useId, useRef, useState } from "react";
import { Button } from "./Button.js";
import s from "./ui.module.css";

export interface MenuAction {
  id: string;
  label: string;
  onSelect: () => void;
  disabledReason?: string | undefined;
}

/** The *Actions* dropdown: an APG menu button (arrow keys, Home/End, Escape, focus return). */
export function ActionsMenu({
  label = "Actions",
  actions,
}: {
  label?: string;
  actions: readonly MenuAction[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const menuId = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (open) items.current[active]?.focus();
  }, [open, active]);

  const close = () => {
    setOpen(false);
    wrap.current?.querySelector("button")?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    const n = actions.length;
    if (e.key === "ArrowDown") setActive((a) => (a + 1) % n);
    else if (e.key === "ArrowUp") setActive((a) => (a - 1 + n) % n);
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(n - 1);
    else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close();
      return;
    } else return;
    e.preventDefault();
  };

  return (
    <span ref={wrap} style={{ position: "relative", display: "inline-block" }}>
      <Button
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setActive(0);
          setOpen((o) => !o);
        }}
      >
        {label} ▾
      </Button>
      {open && (
        <div role="menu" id={menuId} aria-label={label} className={s.menu} onKeyDown={onKey}>
          {actions.map((a, i) => (
            <button
              key={a.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              className={s.menuItem}
              aria-disabled={a.disabledReason !== undefined || undefined}
              title={a.disabledReason}
              onClick={() => {
                if (a.disabledReason !== undefined) return;
                a.onSelect();
                close();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
