import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ServiceTagItem } from "../../../application/ports/adminServiceTags.js";
import {
  draftOf,
  type ServiceTagDraft,
} from "../../../application/usecases/adminServiceTags/AdminServiceTagsUseCases.js";
import { Alert, Button, FormField, Modal, SelectInput, TextInput } from "../../components/index.js";
import { useService } from "../../services.js";

const EMPTY: ServiceTagDraft = {
  key: "",
  mode: "required",
  value: "",
  defaultValue: "",
  allowedValuesText: "",
  description: "",
};

/** Add or edit a service tag: fixed for every team, or required with allowed values and a default. */
export function ServiceTagDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: ServiceTagItem | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const tags = useService("adminServiceTags");
  const [d, setD] = useState<ServiceTagDraft>(existing ? draftOf(existing) : EMPTY);
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;
  const set = <K extends keyof ServiceTagDraft>(k: K, v: ServiceTagDraft[K]) =>
    setD((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setPending(true);
    try {
      await tags.save(existing, d);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      title={existing ? `Edit ${existing.key}` : "Add service tag"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            {existing ? "Save" : "Add tag"}
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The tag was not saved"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField label="Key" error={err?.fields.key}>
        <TextInput
          value={d.key}
          readOnly={existing !== undefined}
          onChange={(e) => set("key", e.target.value)}
        />
      </FormField>
      <FormField label="Kind">
        <SelectInput
          value={d.mode}
          options={[
            { value: "required", label: "Required (each team sets a value)" },
            { value: "fixed", label: "Fixed (the same for every team)" },
          ]}
          onChange={(e) => set("mode", e.target.value === "fixed" ? "fixed" : "required")}
        />
      </FormField>
      {d.mode === "fixed" ? (
        <FormField label="Value" error={err?.fields.value}>
          <TextInput value={d.value} onChange={(e) => set("value", e.target.value)} />
        </FormField>
      ) : (
        <>
          <FormField
            label="Allowed values"
            hint="One per line or comma-separated. Leave empty to allow any value."
          >
            <TextInput
              value={d.allowedValuesText}
              onChange={(e) => set("allowedValuesText", e.target.value)}
            />
          </FormField>
          <FormField
            label="Default value"
            hint="Applied to teams that set none. Optional."
            error={err?.fields.defaultValue}
          >
            <TextInput
              value={d.defaultValue}
              onChange={(e) => set("defaultValue", e.target.value)}
            />
          </FormField>
        </>
      )}
      <FormField label="Description">
        <TextInput value={d.description} onChange={(e) => set("description", e.target.value)} />
      </FormField>
    </Modal>
  );
}
