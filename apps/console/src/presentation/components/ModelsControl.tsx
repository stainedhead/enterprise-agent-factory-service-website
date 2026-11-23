import { useId } from "react";
import {
  droppedModelIds,
  type ModelAccess,
  type ModelsSpec,
  modelsCountText,
  withValidDefault,
} from "../../domain/modelAccess.js";
import s from "./ui.module.css";

export interface ModelOption {
  readonly id: string;
  readonly displayName: string;
}

/**
 * The models field (MOD-3, MOD-6): All or Selected from what the level above allows, chips for the selection and a
 * default model. A stored selection the level above no longer allows is shown struck through with the reason, not
 * removed. `disabledReason` makes it read-only (a role that cannot change it).
 */
export function ModelsControl({
  label = "Models",
  value,
  allowed,
  noun = "team models",
  onChange,
  disabledReason,
  errors,
  dropReasonOf,
}: {
  label?: string;
  value: ModelsSpec;
  /** What the level above allows. */
  allowed: readonly ModelOption[];
  noun?: string;
  onChange: (v: ModelsSpec) => void;
  disabledReason?: string | undefined;
  errors?: { models?: string | undefined; defaultModelId?: string | undefined } | undefined;
  dropReasonOf?: ((id: string) => string) | undefined;
}) {
  const id = useId();
  const ids = allowed.map((m) => m.id);
  const nameOf = (m: string) => allowed.find((a) => a.id === m)?.displayName ?? m;
  const dropped = droppedModelIds(value, ids);
  const off = disabledReason !== undefined;
  const set = (next: ModelsSpec) => onChange(withValidDefault(next, ids));
  const setAccess = (access: ModelAccess) => set({ ...value, access });
  const toggle = (m: string) =>
    set({
      ...value,
      modelIds: value.modelIds.includes(m)
        ? value.modelIds.filter((x) => x !== m)
        : [...value.modelIds, m],
    });
  const effective = value.access === "all" ? ids : value.modelIds.filter((m) => ids.includes(m));
  return (
    <fieldset aria-describedby={`${id}-count`} title={disabledReason}>
      <legend>{label}</legend>
      <div role="radiogroup" aria-label={`${label} access`}>
        {(["all", "selected"] as const).map((a) => (
          <label key={a} style={{ marginRight: 12 }}>
            <input
              type="radio"
              name={`${id}-access`}
              checked={value.access === a}
              aria-disabled={off || undefined}
              onChange={() => !off && setAccess(a)}
            />{" "}
            {a === "all" ? "All" : "Selected"}
          </label>
        ))}
      </div>
      <p id={`${id}-count`}>{modelsCountText(value, ids.length, noun)}</p>
      {value.access === "selected" && (
        <>
          <ul className={s.chips} aria-label="Selected models">
            {value.modelIds.map((m) => (
              <li key={m} className={`${s.chip} ${dropped.includes(m) ? s.chipDropped : ""}`}>
                {nameOf(m)}
                {dropped.includes(m) && (
                  <span> ({dropReasonOf ? dropReasonOf(m) : "Not allowed"})</span>
                )}{" "}
                <button
                  type="button"
                  aria-label={`Remove ${nameOf(m)}`}
                  aria-disabled={off || undefined}
                  onClick={() => !off && toggle(m)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <fieldset>
            <legend>Add a model</legend>
            {allowed
              .filter((m) => !value.modelIds.includes(m.id))
              .map((m) => (
                <label key={m.id} style={{ marginRight: 12 }}>
                  <input
                    type="checkbox"
                    checked={false}
                    aria-disabled={off || undefined}
                    onChange={() => !off && toggle(m.id)}
                  />{" "}
                  {m.displayName}
                </label>
              ))}
          </fieldset>
          {errors?.models && <p role="alert">{errors.models}</p>}
        </>
      )}
      <label htmlFor={`${id}-default`}>Default model</label>{" "}
      <select
        id={`${id}-default`}
        value={value.defaultModelId}
        aria-disabled={off || undefined}
        aria-invalid={errors?.defaultModelId ? true : undefined}
        onChange={(e) => !off && onChange({ ...value, defaultModelId: e.target.value })}
      >
        {value.defaultModelId === "" && <option value="">Choose a default model</option>}
        {effective.map((m) => (
          <option key={m} value={m}>
            {nameOf(m)}
          </option>
        ))}
      </select>
      {errors?.defaultModelId && <p role="alert">{errors.defaultModelId}</p>}
      {off && <p>{disabledReason}</p>}
    </fieldset>
  );
}
