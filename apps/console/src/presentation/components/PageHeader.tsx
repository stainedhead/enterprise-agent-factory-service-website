import type { ReactNode } from "react";
import s from "./ui.module.css";

/** Page title with an *Info* link and right-aligned actions (one primary per page). */
export function PageHeader({
  title,
  description,
  infoHref,
  actions,
  badge,
}: {
  title: string;
  /** A small label beside the title, for example *Paperclip*. */
  badge?: ReactNode;
  description?: string;
  infoHref?: string;
  actions?: ReactNode;
}) {
  return (
    <header className={s.hdr}>
      <div>
        <h1>
          {title} {badge} {infoHref && <a href={infoHref}>Info</a>}
        </h1>
        {description && <div className={s.desc}>{description}</div>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}
