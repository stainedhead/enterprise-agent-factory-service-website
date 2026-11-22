import type { ReactNode } from "react";
import s from "./ui.module.css";

/** A definition list of label/value pairs for detail pages. */
export function KeyValue({ items }: { items: readonly { label: string; value: ReactNode }[] }) {
  return (
    <dl className={s.kv}>
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
