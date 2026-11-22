import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { SettingRecord } from "../../../../../application/ports/settings.js";
import { settingText } from "../../../../../application/usecases/settings/SettingsUseCases.js";
import { formatLocal } from "../../../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  FormField,
  Modal,
  SelectInput,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { ConflictAlert } from "../../../../query/ConflictAlert.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";

/** *Settings* section: every key with value, default, allowed range and last change; *Edit* (WEB-US-20.1). */
export function SettingsTab() {
  const settings = useService("settings");
  const me = useMe();
  const qc = useQueryClient();
  const key = queryKey({ area: "settings", resource: "settings" });
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => settings.list(signal) });
  const [editing, setEditing] = useState<SettingRecord | undefined>();
  const denied = gate(me, "admin:settings");

  return (
    <Card title="Settings">
      <Table
        id="service-settings"
        caption="Service settings"
        filterLabel="Filter settings"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        columns={[
          {
            id: "key",
            header: "Key",
            alwaysVisible: true,
            sortValue: (s) => s.key,
            cell: (s) => <code>{s.key}</code>,
            text: (s) => s.key,
          },
          {
            id: "value",
            header: "Value",
            cell: (s) => settingText(s.value) || "—",
            text: (s) => settingText(s.value),
          },
          { id: "default", header: "Default", cell: (s) => settingText(s.default) || "—" },
          { id: "allowed", header: "Allowed", cell: (s) => s.allowed },
          {
            id: "changed",
            header: "Last change",
            sortValue: (s) => s.updatedAt ?? "",
            cell: (s) =>
              s.updatedAt ? (
                <time dateTime={s.updatedAt}>{formatLocal(s.updatedAt)}</time>
              ) : (
                "Never"
              ),
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (s) => (
              <Button
                aria-label={`Edit ${s.key}`}
                disabledReason={denied}
                onClick={() => setEditing(s)}
              >
                Edit
              </Button>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(s) => s.key}
      />
      {editing && (
        <EditSettingDialog
          setting={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => void qc.invalidateQueries({ queryKey: key })}
        />
      )}
    </Card>
  );
}

function EditSettingDialog({
  setting,
  onClose,
  onSaved,
}: {
  setting: SettingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const settings = useService("settings");
  const [text, setText] = useState(settingText(setting.value));
  const save = useMutation({
    mutationFn: () => settings.edit(setting, text),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const err = isAppError(save.error) ? save.error : undefined;
  return (
    <Modal
      title={`Edit ${setting.key}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending || err?.kind === "stale"}
            onClick={() => save.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      {err?.kind === "stale" ? (
        <ConflictAlert
          onReload={() => {
            onSaved();
            onClose();
          }}
          requestId={err.requestId}
        />
      ) : (
        err &&
        !err.isAccessDenied &&
        Object.keys(err.fields).length === 0 && (
          <Alert kind="error" requestId={err.requestId}>
            {err.message}
          </Alert>
        )
      )}
      <FormField
        label="Value"
        hint={`Allowed: ${setting.allowed}. Default: ${settingText(setting.default) || "none"}`}
        error={err?.fields.value}
      >
        {setting.type === "boolean" ? (
          <SelectInput
            value={text}
            options={[
              { value: "true", label: "true" },
              { value: "false", label: "false" },
            ]}
            onChange={(e) => setText(e.target.value)}
          />
        ) : (
          <TextInput value={text} onChange={(e) => setText(e.target.value)} />
        )}
      </FormField>
    </Modal>
  );
}
