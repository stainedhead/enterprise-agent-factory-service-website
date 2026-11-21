import type { ReactNode } from "react";
import { Button } from "./Button.js";
import { CopyButton } from "./CopyButton.js";
import s from "./ui.module.css";

export type AlertKind = "info" | "warning" | "error" | "success";

export interface AlertProps {
  kind?: AlertKind;
  title?: string;
  children?: ReactNode;
  /** Shown with a copy button so people can quote it to support (WEB-11). */
  requestId?: string | undefined;
  onDismiss?: () => void;
  action?: { label: string; onClick: () => void };
}

/** An alert; errors and warnings are announced (role alert), the rest are status regions. */
export function Alert({
  kind = "info",
  title,
  children,
  requestId,
  onDismiss,
  action,
}: AlertProps) {
  const role = kind === "error" || kind === "warning" ? "alert" : "status";
  return (
    <div role={role} className={`${s.alert} ${kind === "info" ? "" : s[kind]}`}>
      <div className={s.alertBody}>
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
        {requestId && (
          <div>
            <span className={s.reqId}>Request id: {requestId}</span>{" "}
            <CopyButton text={requestId} label="Copy request id" />
          </div>
        )}
      </div>
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
      {onDismiss && (
        <Button variant="link" aria-label="Dismiss" onClick={onDismiss}>
          ×
        </Button>
      )}
    </div>
  );
}
