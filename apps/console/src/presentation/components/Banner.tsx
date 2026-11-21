import type { ReactNode } from "react";
import { Button } from "./Button.js";
import s from "./ui.module.css";

/** A page-wide banner with an optional action (for example "AFS is not responding" with *Retry*). */
export function Banner({
  children,
  action,
}: {
  children: ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div role="status" className={s.banner}>
      <span>{children}</span>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
