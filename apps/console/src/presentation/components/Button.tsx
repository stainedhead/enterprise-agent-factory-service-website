import type { MouseEvent, ReactNode } from "react";
import { Tooltip } from "./Tooltip.js";
import s from "./ui.module.css";

export interface ButtonProps {
  children: ReactNode;
  variant?: "normal" | "primary" | "link";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit";
  /** When set, the button is disabled (not hidden) and a focusable tooltip says why, e.g. "Requires team-admin". */
  disabledReason?: string | undefined;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-haspopup"?: "menu";
  "aria-expanded"?: boolean;
}

/** A button. Disabled buttons stay focusable and explain themselves (WEB-3). */
export function Button({
  children,
  variant = "normal",
  onClick,
  type = "button",
  disabledReason,
  disabled,
  ...aria
}: ButtonProps) {
  const isDisabled = disabled === true || disabledReason !== undefined;
  const cls = [s.btn, variant === "primary" ? s.primary : variant === "link" ? s.link : ""]
    .join(" ")
    .trim();
  return (
    <Tooltip text={disabledReason}>
      {(describedBy) => (
        <button
          type={type}
          className={cls}
          aria-disabled={isDisabled || undefined}
          aria-describedby={describedBy}
          onClick={(e) => {
            if (isDisabled) {
              e.preventDefault();
              return;
            }
            onClick?.(e);
          }}
          {...aria}
        >
          {children}
        </button>
      )}
    </Tooltip>
  );
}
