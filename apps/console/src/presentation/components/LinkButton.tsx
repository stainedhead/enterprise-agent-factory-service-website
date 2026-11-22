import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip.js";
import s from "./ui.module.css";

/**
 * A link styled as a button that opens in a new tab with `rel="noopener noreferrer"`. Disabled it keeps its
 * place, carries `aria-disabled` and names the reason through a focusable tooltip (WEB-3).
 */
export function LinkButton({
  href,
  children,
  variant = "primary",
  disabledReason,
}: {
  href: string | null;
  children: ReactNode;
  variant?: "normal" | "primary";
  disabledReason?: string | undefined;
}) {
  const cls = [s.btn, variant === "primary" ? s.primary : ""].join(" ").trim();
  if (disabledReason !== undefined || href === null)
    return (
      <Tooltip text={disabledReason}>
        {(describedBy) => (
          // biome-ignore lint/a11y/useSemanticElements: a disabled link keeps the link role without an href
          <span
            className={cls}
            role="link"
            aria-disabled="true"
            aria-describedby={describedBy}
            tabIndex={0}
          >
            {children}
          </span>
        )}
      </Tooltip>
    );
  return (
    <a className={cls} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
