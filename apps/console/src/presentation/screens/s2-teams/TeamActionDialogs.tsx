import { useState } from "react";
import type { AppError } from "../../../application/errors.js";
import type { TeamRecord } from "../../../application/ports/teams.js";
import { format } from "../../../domain/money.js";
import { exposureLabel, setLimitCli } from "../../../domain/orchestration.js";
import {
  Alert,
  Button,
  CliPreview,
  ConfirmDialog,
  ExposureControl,
  FormField,
  Modal,
  TextInput,
  TypeToConfirm,
} from "../../components/index.js";
import { useService } from "../../services.js";

export interface TeamDialog {
  readonly kind: "suspend" | "resume" | "delete" | "ceiling" | "raise" | "limit";
  readonly team: TeamRecord;
}

/** The S2 *Actions* dialogs (M1-T3). The page owns the selected team and the mutation. */
export function TeamActionDialogs({
  dialog,
  onClose,
  run,
  busy,
  error,
}: {
  dialog: TeamDialog | undefined;
  onClose: () => void;
  run: (fn: () => Promise<unknown>) => void;
  busy: boolean;
  error: AppError | undefined;
}) {
  const teams = useService("teams");
  if (!dialog) return null;
  const { team } = dialog;
  const ref = { id: team.id, version: team.version };
  if (dialog.kind === "suspend")
    return (
      <ConfirmDialog
        title={`Suspend ${team.slug}`}
        confirmLabel="Suspend"
        onCancel={onClose}
        onConfirm={() => run(() => teams.suspend(team.id))}
      >
        Agents in the team stop and writes are blocked until it is resumed.
      </ConfirmDialog>
    );
  if (dialog.kind === "resume")
    return (
      <ConfirmDialog
        title={`Resume ${team.slug}`}
        confirmLabel="Resume"
        onCancel={onClose}
        onConfirm={() => run(() => teams.resume(team.id))}
      >
        The team becomes active again.
      </ConfirmDialog>
    );
  if (dialog.kind === "delete")
    return (
      <TypeToConfirm
        title={`Delete ${team.slug}`}
        expected={team.slug}
        onCancel={onClose}
        onConfirm={() => run(() => teams.delete(ref))}
      >
        Deleting removes the team's namespace and agents. Its usage, cost and history stay readable.
      </TypeToConfirm>
    );
  if (dialog.kind === "limit")
    return <LimitDialog team={team} onClose={onClose} run={run} busy={busy} error={error} />;
  return (
    <CeilingDialog
      key={dialog.kind}
      dialog={dialog}
      onClose={onClose}
      run={run}
      busy={busy}
      error={error}
    />
  );
}

function CeilingDialog({
  dialog,
  onClose,
  run,
  busy,
  error,
}: {
  dialog: TeamDialog;
  onClose: () => void;
  run: (fn: () => Promise<unknown>) => void;
  busy: boolean;
  error: AppError | undefined;
}) {
  const teams = useService("teams");
  const { team } = dialog;
  const temp = dialog.kind === "raise";
  const [amount, setAmount] = useState("");
  const [expires, setExpires] = useState("");
  const [reason, setReason] = useState("");
  const ref = { id: team.id, version: team.version };
  const submit = () =>
    run(() =>
      temp
        ? teams.raiseCeilingTemporarily(ref, {
            amountUsd: amount,
            expiresAt: expires ? new Date(expires).toISOString() : "",
            reason,
          })
        : teams.setCeiling(ref, amount),
    );
  const f = error?.kind === "validation" ? error.fields : {};
  return (
    <Modal
      title={temp ? `Raise ceiling temporarily for ${team.slug}` : `Set ceiling for ${team.slug}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {temp ? "Raise ceiling" : "Set ceiling"}
          </Button>
        </>
      }
    >
      <p>
        Current budget {format(team.maxBudgetUsd)}, effective ceiling{" "}
        {format(team.effectiveCeilingUsd)}.
      </p>
      {error && (
        <Alert kind="error" requestId={error.requestId}>
          {error.message}
        </Alert>
      )}
      <FormField
        label={temp ? "Temporary ceiling (USD)" : "Ceiling (USD)"}
        hint="A decimal amount such as 6000.00"
        error={f[temp ? "ceilingOverrideUsd" : "maxBudgetUsd"]}
      >
        <TextInput inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      {temp && (
        <>
          <FormField label="Until" error={f.ceilingOverrideExpiresAt}>
            <TextInput
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
          </FormField>
          <FormField
            label="Reason"
            hint="Recorded in the audit log only"
            error={f.ceilingOverrideReason}
          >
            <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
        </>
      )}
    </Modal>
  );
}

/** *Set endpoint limit* (service admins): lowering keeps the team's choices, they apply again if it is raised (ORC-14). */
function LimitDialog({
  team,
  onClose,
  run,
  busy,
  error,
}: {
  team: TeamRecord;
  onClose: () => void;
  run: (fn: () => Promise<unknown>) => void;
  busy: boolean;
  error: AppError | undefined;
}) {
  const teams = useService("teams");
  const current = team.maxCollaborationExposure ?? "private";
  const [limit, setLimit] = useState(current);
  return (
    <Modal
      title={`Set endpoint limit for ${team.slug}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            disabledReason={limit === current ? "Nothing changed" : undefined}
            onClick={() =>
              run(() => teams.setEndpointLimit({ id: team.id, version: team.version }, limit))
            }
          >
            Set limit
          </Button>
        </>
      }
    >
      <p>
        The team's limit is {exposureLabel(current)}. Lowering it lowers what is in effect within a
        minute and keeps the team's choices.
      </p>
      {error && (
        <Alert kind="error" requestId={error.requestId}>
          {error.message}
        </Alert>
      )}
      <ExposureControl
        label="Endpoint limit"
        value={limit}
        limit="public"
        supported
        tool="paperclip"
        onChange={setLimit}
      />
      <CliPreview command={setLimitCli(team.id, limit)} />
    </Modal>
  );
}
