import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { StorageClassRecord } from "../../../../../application/ports/agents.js";
import {
  Alert,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  Modal,
  SelectInput,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";

const key = queryKey({ area: "admin-catalogs", resource: "storage-classes" });

/** S10 *Storage classes* (WEB-US-20.3): add, edit, enable or disable and remove; a class in use cannot be removed. */
export function StorageClassesTab() {
  const svc = useService("adminStorageClasses");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:storage-classes");
  const [dialog, setDialog] = useState<
    { kind: "edit"; c?: StorageClassRecord } | { kind: "delete"; c: StorageClassRecord } | undefined
  >();
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => svc.list(signal) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const toggle = useMutation({
    mutationFn: (c: StorageClassRecord) => svc.setEnabled(c, !c.enabled),
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (c: StorageClassRecord) => svc.delete(c),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = [toggle.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  const agents = Array.isArray(err?.details.agents) ? (err.details.agents as string[]) : [];
  return (
    <Card
      title="Storage classes"
      actions={
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "edit" })}
        >
          Add storage class
        </Button>
      }
    >
      {err && !err.isAccessDenied && (
        <Alert
          kind="error"
          title={
            err.kind === "conflict"
              ? `${del.variables?.name ?? "The storage class"} is in use`
              : "The change was not applied"
          }
          requestId={err.requestId}
        >
          {err.message}
          {agents.length > 0 && <> Agents using it: {agents.join(", ")}.</>}
        </Alert>
      )}
      <Table
        id="storage-classes"
        caption="Storage classes"
        filterLabel="Find storage classes"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No storage classes."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: (c) => c.name,
            cell: (c) => c.name,
          },
          {
            id: "type",
            header: "Volume type",
            sortValue: (c) => c.volumeType,
            cell: (c) => c.volumeType,
          },
          { id: "desc", header: "Description", cell: (c) => c.description ?? "—" },
          {
            id: "state",
            header: "State",
            text: (c) => (c.enabled ? "Enabled" : "Disabled"),
            cell: (c) => (c.enabled ? "Enabled" : <Badge>Disabled</Badge>),
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (c) => (
              <>
                <Button
                  aria-label={`${c.enabled ? "Disable" : "Enable"} ${c.name}`}
                  disabledReason={reason}
                  onClick={() => toggle.mutate(c)}
                >
                  {c.enabled ? "Disable" : "Enable"}
                </Button>{" "}
                <Button
                  aria-label={`Edit ${c.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "edit", c })}
                >
                  Edit
                </Button>{" "}
                <Button
                  aria-label={`Delete ${c.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "delete", c })}
                >
                  Delete
                </Button>
              </>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(c) => c.name}
      />
      {dialog?.kind === "edit" && (
        <ClassDialog
          existing={dialog.c}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.c.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.c)}
        >
          A storage class that agents use cannot be removed.
        </ConfirmDialog>
      )}
    </Card>
  );
}

function ClassDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: StorageClassRecord | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const svc = useService("adminStorageClasses");
  const [name, setName] = useState(existing?.name ?? "");
  const [volumeType, setVolumeType] = useState(existing?.volumeType ?? "gp3");
  const [description, setDescription] = useState(existing?.description ?? "");
  const save = useMutation({
    mutationFn: () =>
      svc.put(name, { volumeType, description, enabled: existing?.enabled ?? true }, existing),
    onSuccess: onSaved,
  });
  const err = isAppError(save.error) ? save.error : undefined;
  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Add storage class"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      {err && !err.isAccessDenied && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The storage class was not saved" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField label="Name" error={err?.fields.name}>
        <TextInput
          value={name}
          readOnly={existing !== undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </FormField>
      <FormField label="Volume type" error={err?.fields.volumeType}>
        <SelectInput
          value={volumeType}
          options={[
            { value: "gp3", label: "gp3" },
            { value: "io2", label: "io2" },
          ]}
          onChange={(e) => setVolumeType(e.target.value)}
        />
      </FormField>
      <FormField label="Description">
        <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
      </FormField>
    </Modal>
  );
}
