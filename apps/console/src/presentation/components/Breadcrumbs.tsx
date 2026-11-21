import type { ReactNode } from "react";
import s from "./ui.module.css";

export interface Crumb {
  label: string;
  /** Rendered by the caller's link component; the last crumb is the current page. */
  to?: string;
}

/** Breadcrumb trail. `renderLink` lets the router supply its Link without this kit importing it. */
export function Breadcrumbs({
  crumbs,
  renderLink = (c) => <a href={c.to}>{c.label}</a>,
}: {
  crumbs: readonly Crumb[];
  renderLink?: (c: Crumb) => ReactNode;
}) {
  return (
    <nav aria-label="Breadcrumb" className={s.crumbs}>
      <ol>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={c.to ?? c.label} aria-current={last ? "page" : undefined}>
              {last || !c.to ? c.label : renderLink(c)}
              {!last && <span aria-hidden="true"> ›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
