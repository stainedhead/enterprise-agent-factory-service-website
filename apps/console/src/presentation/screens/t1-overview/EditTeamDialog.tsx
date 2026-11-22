import { useQuery } from "@tanstack/react-query";
import { isAppError } from "../../../application/errors.js";
import type { TeamRecord } from "../../../application/ports/teams.js";
import { Alert, Button, FormField, Modal, SelectInput, TextInput } from "../../components/index.js";
import { useVersionedForm } from "../../hooks/useVersionedForm.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";

interface Draft {
  displayName: string;
  description: string;
  ownerEmail: string;
  identityProviderId: string;
}

/** *Edit* on T1: display name, description, owner and sign-in provider (WEB-US-24.5, WEB-US-10.1). */
export function EditTeamDialog({
  team,
  onClose,
  onSaved,
}: {
  team: TeamRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const teams = useService("teams");
  const providers = useService("signInProviders");
  const list = useQuery({
    queryKey: queryKey({ area: "teams", resource: "sign-in-providers" }),
    queryFn: () => providers.execute(),
  });
  const form = useVersionedForm<TeamRecord, Draft>({
    initial: team,
    toDraft: (t) => ({
      displayName: t.displayName,
      description: t.description ?? "",
      ownerEmail: t.ownerEmail ?? "",
      identityProviderId: t.identityProviderId ?? "",
    }),
    save: (d, version) =>
      teams.update(
        { id: team.id, version },
        {
          displayName: d.displayName,
          description: d.description,
          ownerEmail: d.ownerEmail,
          ...(d.identityProviderId !== "" && { identityProviderId: d.identityProviderId }),
        },
      ),
    reload: () => teams.get(team.id),
    onSaved,
  });
  const { draft, setDraft } = form;
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const f = form.fieldErrors;
  const err = form.error;
  const cur = form.current;
  const options = (list.data?.providers ?? []).map((p) => ({ value: p.id, label: p.name }));

  return (
    <Modal
      title={`Edit ${team.slug}`}
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
          Current values: {cur.displayName}
          {cur.ownerEmail ? `, owner ${cur.ownerEmail}` : ""}. Your edits are kept below; save to
          apply them.
        </Alert>
      )}
      {isAppError(err) && !form.stale && (
        <Alert kind="error" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField label="Display name" error={f.displayName}>
        <TextInput value={draft.displayName} onChange={(e) => set("displayName", e.target.value)} />
      </FormField>
      <FormField label="Description" error={f.description}>
        <TextInput value={draft.description} onChange={(e) => set("description", e.target.value)} />
      </FormField>
      <FormField label="Owner email" error={f.ownerEmail}>
        <TextInput
          type="email"
          value={draft.ownerEmail}
          onChange={(e) => set("ownerEmail", e.target.value)}
        />
      </FormField>
      {options.length > 1 && (
        <FormField
          label="Sign-in provider"
          hint="Among the enabled providers"
          error={f.identityProviderId}
        >
          <SelectInput
            value={draft.identityProviderId}
            placeholder="Service default"
            options={options}
            onChange={(e) => set("identityProviderId", e.target.value)}
          />
        </FormField>
      )}
    </Modal>
  );
}
