import { type ReactElement, type ReactNode, useId, useState } from "react";
import s from "./ui.module.css";

/** A tooltip shown on hover and keyboard focus; the child is described by it (aria-describedby). */
export function Tooltip({
  text,
  children,
}: {
  text: string | undefined;
  children: ReactElement | ((id: string | undefined) => ReactNode);
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const describedBy = text ? id : undefined;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only forwards hover and focus to show the tooltip
    <span
      className={s.tipWrap}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
    >
      {typeof children === "function" ? children(describedBy) : children}
      {text && open && (
        <span role="tooltip" id={id} className={s.tip}>
          {text}
        </span>
      )}
    </span>
  );
}
