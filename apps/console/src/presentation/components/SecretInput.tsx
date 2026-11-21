import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { registerSecretInput } from "./secretRegistry.js";
import s from "./ui.module.css";

export interface SecretInputHandle {
  /** Reads the value at submit time; it is never in React state. */
  read(): string;
  clear(): void;
}

/** A masked, uncontrolled input. The value is read by ref at submit and cleared on submit, cancel, error and session clear. */
export const SecretInput = forwardRef<
  SecretInputHandle,
  { id?: string; name?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }
>(function SecretInput(props, ref) {
  const input = useRef<HTMLInputElement>(null);
  const clear = useCallback(() => {
    if (input.current) input.current.value = "";
  }, []);
  useImperativeHandle(ref, () => ({ read: () => input.current?.value ?? "", clear }), [clear]);
  useEffect(() => registerSecretInput(clear), [clear]);
  return (
    <input
      ref={input}
      type="password"
      autoComplete="off"
      spellCheck={false}
      className={s.input}
      {...props}
    />
  );
});
