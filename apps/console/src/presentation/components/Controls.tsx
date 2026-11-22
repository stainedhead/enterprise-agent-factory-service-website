import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import s from "./ui.module.css";

/** A text input in the console's style; pair it with {@link FormField} for the label and error. */
export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...rest }, ref) {
    return <input ref={ref} className={[s.input, className].filter(Boolean).join(" ")} {...rest} />;
  },
);

/** A native select with a list of options. */
export function SelectInput({
  options,
  placeholder,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly { value: string; label: string }[];
  /** First empty option, for "no choice". */
  placeholder?: string;
}) {
  return (
    <select className={s.input} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** A titled card, the AWS-style container of a page section. */
export function Card({
  title,
  children,
  actions,
}: {
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={s.card} aria-label={title}>
      {(title || actions) && (
        <div className={s.tools}>
          {title && <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>}
          {actions && <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>{actions}</div>}
        </div>
      )}
      <div style={{ padding: "0 20px 16px" }}>{children}</div>
    </section>
  );
}

/** A row of filters or controls above a table. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className={s.tools}>{children}</div>;
}
