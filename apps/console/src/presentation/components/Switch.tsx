import { useId } from "react";
import { Tooltip } from "./Tooltip.js";
import s from "./ui.module.css";

/**
 * An on/off switch (`role="switch"`). When it cannot be changed it stays focusable with `aria-disabled` and
 * the reason as its tooltip and `aria-describedby`; a change is refused while disabled.
 */
export function Switch({
  label,
  checked,
  onChange,
  disabledReason,
  busy,
  describedBy,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabledReason?: string | undefined;
  busy?: boolean;
  /** An id of text that also describes the switch (for example the card's note). */
  describedBy?: string | undefined;
}) {
  const id = useId();
  const blocked = disabledReason !== undefined || busy === true;
  return (
    <span className={s.switch}>
      <Tooltip text={disabledReason}>
        {(tipId) => (
          <input
            id={id}
            type="checkbox"
            role="switch"
            aria-label={label}
            aria-checked={checked}
            aria-disabled={blocked || undefined}
            aria-describedby={[tipId, describedBy].filter(Boolean).join(" ") || undefined}
            checked={checked}
            onChange={(e) => {
              if (!blocked) onChange(e.target.checked);
            }}
          />
        )}
      </Tooltip>
    </span>
  );
}
