import { type ReactNode, useId, useState } from "react";
import { Button } from "./Button.js";
import { Modal } from "./Modal.js";
import s from "./ui.module.css";

/** Confirm a change, with an optional note (for example a reason recorded in the audit log). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel = "Confirm",
  withNote,
  onConfirm,
  onCancel,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  withNote?: { label: string; required?: boolean };
  onConfirm: (note?: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const id = useId();
  const blocked = withNote?.required === true && note.trim() === "";
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={blocked}
            onClick={() => onConfirm(withNote ? note.trim() : undefined)}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {withNote && (
        <div className={s.field}>
          <label htmlFor={id}>{withNote.label}</label>
          <input
            id={id}
            className={s.input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
