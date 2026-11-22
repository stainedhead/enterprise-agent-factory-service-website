import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "./Button.js";
import { Modal } from "./Modal.js";
import s from "./ui.module.css";

export interface OneTimeSecretHandle {
  /** Shows `value` once. The value lives in a ref and the DOM only; it is cleared when the dialog closes. */
  show(value: string): void;
}

/** The one-time secret dialog (a new API key's `secretKey`): *Copy*, a warning, nothing kept after close. */
export const OneTimeSecretDialog = forwardRef<
  OneTimeSecretHandle,
  { title: string; label: string; onClosed?: () => void }
>(function OneTimeSecretDialog({ title, label, onClosed }, ref) {
  const value = useRef<string>("");
  const out = useRef<HTMLOutputElement>(null);
  const [open, setOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    show(v: string) {
      value.current = v;
      setOpen(true);
    },
  }));

  useEffect(() => {
    if (open && out.current) out.current.textContent = value.current;
  }, [open]);

  const close = () => {
    value.current = "";
    if (out.current) out.current.textContent = "";
    setOpen(false);
    onClosed?.();
  };

  if (!open) return null;
  return (
    <Modal
      title={title}
      onClose={close}
      actions={
        <Button variant="primary" onClick={close}>
          Done
        </Button>
      }
    >
      <p role="alert">
        This is the only time the {label} is shown. Copy it now; it cannot be retrieved later.
      </p>
      <p>
        <output ref={out} className={s.mono} aria-label={label} />
      </p>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value.current);
          } catch {
            // clipboard refused; the value stays selectable on screen
          }
        }}
      >
        Copy
      </Button>
    </Modal>
  );
});
