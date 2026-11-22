import { cloneElement, isValidElement, type ReactElement, useId } from "react";
import s from "./ui.module.css";

/** One entry of `ValidationError.details.fields[]`. */
export interface FieldError {
  field: string;
  message: string;
}

/** Finds the message for `field` in the API's `details.fields[]`. */
export function fieldMessage(
  fields: readonly FieldError[] | undefined,
  field: string,
): string | undefined {
  return fields?.find((f) => f.field === field)?.message;
}

/** A labelled field with a hint and an error; the control gets the ids it needs. */
export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: ReactElement<Record<string, unknown>>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy =
    [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      {isValidElement(children) &&
        cloneElement(children, {
          id,
          "aria-describedby": describedBy,
          "aria-invalid": error ? true : undefined,
        })}
      {hint && (
        <div id={hintId} className={s.hint}>
          {hint}
        </div>
      )}
      {error && (
        <div id={errId} className={s.fieldError} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
