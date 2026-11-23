import { useId } from "react";
import { type Exposure, exposureOptions } from "../../domain/orchestration.js";
import s from "./ui.module.css";

/**
 * Off / Private / Public as a radio group. An option that cannot be chosen (above the team limit, or a surface the
 * tool lacks) stays visible and focusable, `aria-disabled`, with the reason as its description (never hidden).
 */
export function ExposureControl({
  label,
  value,
  limit,
  supported,
  tool,
  onChange,
  disabledReason,
}: {
  label: string;
  value: string;
  limit: string;
  supported: boolean;
  tool: string;
  onChange: (v: Exposure) => void;
  /** Blocks the whole control (a role that cannot change it). */
  disabledReason?: string | undefined;
}) {
  const name = useId();
  const options = exposureOptions({ limit, supported, tool });
  return (
    <div role="radiogroup" aria-label={label} className={s.segmented}>
      {options.map((o) => {
        const reason = disabledReason ?? o.disabledReason;
        const id = `${name}-${o.value}`;
        return (
          <label key={o.value} htmlFor={id} aria-disabled={reason ? true : undefined}>
            <input
              id={id}
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              aria-describedby={reason ? `${id}-why` : undefined}
              aria-disabled={reason ? true : undefined}
              onChange={() => {
                if (!reason) onChange(o.value);
              }}
            />
            {o.label}
            {reason && (
              <span id={`${id}-why`} hidden>
                {reason}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
