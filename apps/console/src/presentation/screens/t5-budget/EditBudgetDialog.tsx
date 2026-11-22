import { isAppError } from "../../../application/errors.js";
import type { BudgetRecord } from "../../../application/ports/budgets.js";
import type { TeamRecord } from "../../../application/ports/teams.js";
import {
  type BudgetDraft,
  toBudgetDraft,
} from "../../../application/usecases/budgets/BudgetsUseCases.js";
import { format } from "../../../domain/money.js";
import { Alert, Button, FormField, Modal, SelectInput, TextInput } from "../../components/index.js";
import { useVersionedForm } from "../../hooks/useVersionedForm.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { useService } from "../../services.js";

/**
 * *Edit budget* (WEB-US-28.2, WEB-US-28.3): amount and thresholds for team-admins; the action at exhaustion
 * only for service admins and persistent teams (D33). An amount above the ceiling is refused here naming it.
 */
export function EditBudgetDialog({
  team,
  budget,
  mayChooseAction,
  onClose,
  onSaved,
}: {
  team: TeamRecord;
  budget: BudgetRecord;
  mayChooseAction: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const budgets = useService("budgets");
  const ctx = { ceilingUsd: team.effectiveCeilingUsd, kind: team.kind };
  const form = useVersionedForm<BudgetRecord & { version: number }, BudgetDraft>({
    initial: budget,
    toDraft: toBudgetDraft,
    save: (d, version) => budgets.save(team.id, budget, d, ctx, version),
    reload: () => budgets.budget(team.id),
    onSaved,
  });
  const { draft, setDraft } = form;
  const f = form.fieldErrors;
  const err = form.error;
  const set = (k: keyof BudgetDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const cur = form.current;
  return (
    <Modal
      title="Edit budget"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={form.saving || form.stale}
            onClick={async () => {
              if (await form.submit()) onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {form.stale && (
        <ConflictAlert
          onReload={() => void form.reload()}
          requestId={isAppError(err) ? err.requestId : undefined}
        />
      )}
      {cur && !form.stale && (
        <Alert kind="info" title="Reloaded">
          Current amount: {format(cur.amountUsd)}. Your edits are kept below; save to apply them.
        </Alert>
      )}
      {isAppError(err) && !form.stale && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The budget was not saved" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField
        label="Amount (USD)"
        hint={`The team's ceiling is ${format(team.effectiveCeilingUsd)}`}
        error={f.amountUsd}
      >
        <TextInput value={draft.amountUsd} onChange={(e) => set("amountUsd", e.target.value)} />
      </FormField>
      <FormField label="Alert thresholds (%)" hint="For example 50, 80, 100" error={f.thresholds}>
        <TextInput value={draft.thresholds} onChange={(e) => set("thresholds", e.target.value)} />
      </FormField>
      {mayChooseAction && (
        <FormField label="At exhaustion" error={f.onExhaust}>
          <SelectInput
            value={draft.onExhaust}
            options={[
              { value: "block", label: "Block calls" },
              { value: "notify", label: "Notify only" },
            ]}
            onChange={(e) => set("onExhaust", e.target.value)}
          />
        </FormField>
      )}
    </Modal>
  );
}
