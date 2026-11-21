import { type ReactNode, useId, useState } from "react";
import { Button } from "./Button.js";
import { Modal } from "./Modal.js";
import s from "./ui.module.css";

/** A destructive confirmation: the action stays disabled until the exact name is typed. */
export function TypeToConfirm({
  title,
  expected,
  children,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title: string;
  expected: string;
  children?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const id = useId();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={typed !== expected} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      <div className={s.field}>
        <label htmlFor={id}>
          Type <strong>{expected}</strong> to confirm
        </label>
        <input
          id={id}
          className={s.input}
          value={typed}
          autoComplete="off"
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
    </Modal>
  );
}
