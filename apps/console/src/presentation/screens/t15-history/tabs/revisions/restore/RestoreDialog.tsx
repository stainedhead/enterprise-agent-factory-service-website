import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../../application/errors.js";
import type { RestoreChangeRecord } from "../../../../../../application/ports/history.js";
import { Alert, Button, ConfirmDialog, Modal } from "../../../../../components/index.js";
import { queryKey } from "../../../../../query/keys.js";
import { useService } from "../../../../../services.js";

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

function Changes({ items, label }: { items: readonly RestoreChangeRecord[]; label: string }) {
  return (
    <ul aria-label={label}>
      {items.map((c) => (
        <li key={`${c.resourceKind}:${c.resourceId}:${c.action}`}>
          <strong>{c.action}</strong> {c.resourceKind} <code>{c.resourceId}</code>
          {c.reason && <> · {c.reason}</>}
          {c.fields.length > 0 && (
            <ul>
              {c.fields.map((f) => (
                <li key={f.field}>
                  {f.field}: {show(f.from)} → {show(f.to)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * *Restore* (WEB-US-35.3): the plan for restoring a revision comes first (`dryRun`), including what is skipped
 * because a binding or reference no longer resolves; *Apply* asks to confirm before anything changes.
 */
export function RestoreDialog({
  teamId,
  revision,
  onClose,
  onApplied,
}: {
  teamId: string;
  revision: number;
  onClose: () => void;
  onApplied: () => void;
}) {
  const history = useService("history");
  const [confirm, setConfirm] = useState(false);
  const plan = useQuery({
    queryKey: queryKey({
      area: "revisions",
      teamId,
      resource: "restore-plan",
      id: String(revision),
    }),
    queryFn: () => history.restorePlan(teamId, revision),
    gcTime: 0,
    retry: false,
  });
  const apply = useMutation({
    mutationFn: () => history.restoreApply(teamId, revision),
    onSuccess: onApplied,
    onSettled: () => setConfirm(false),
  });
  const err = [plan.error, apply.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  const p = plan.data;
  const nothing = p !== undefined && p.changes.length === 0;

  return (
    <>
      <Modal
        title={`Restore revision ${revision}`}
        onClose={onClose}
        actions={
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!p || nothing || apply.isPending}
              onClick={() => setConfirm(true)}
            >
              Apply restore
            </Button>
          </>
        }
      >
        {err && (
          <Alert
            kind="error"
            title={err.isAccessDenied ? "You do not have access" : "The restore did not run"}
            requestId={err.requestId}
          >
            {err.message}
          </Alert>
        )}
        {plan.isPending && <p role="status">Planning the restore…</p>}
        {p && (
          <>
            <p>This is the plan; nothing has changed yet.</p>
            {nothing ? (
              <p>Nothing to change: the resource already matches this revision.</p>
            ) : (
              <Changes items={p.changes} label="Changes" />
            )}
            {p.skipped.length > 0 && (
              <>
                <h3>Skipped</h3>
                <p>These bindings or references no longer resolve and are left as they are.</p>
                <Changes items={p.skipped} label="Skipped" />
              </>
            )}
          </>
        )}
      </Modal>
      {confirm && (
        <ConfirmDialog
          title={`Apply restore of revision ${revision}`}
          confirmLabel="Restore"
          onCancel={() => setConfirm(false)}
          onConfirm={() => apply.mutate()}
        >
          <p>
            This changes {p?.changes.length ?? 0} resource(s) to match revision {revision}. The
            restore is recorded as a new revision.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
