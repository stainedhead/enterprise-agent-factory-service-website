import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { SettingRecord } from "../../../application/ports/settings.js";
import {
  badCidrs,
  cidrLinesToList,
  orchestrationConfirmation,
  settingFieldText,
} from "../../../domain/orchestration.js";
import { Alert, Button, FormField, Modal, SelectInput, TextInput } from "../../components/index.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { DeniedAlert } from "../../query/DeniedAlert.js";
import { useService } from "../../services.js";

const CHOICES: Record<string, readonly string[]> = {
  "collab.content_scan": ["block", "warn", "off"],
  "orchestration.default_limit": ["off", "private", "public"],
  "orchestration.default_web_ui_exposure": ["off", "private", "public"],
  "orchestration.default_web_api_exposure": ["off", "private", "public"],
  "orchestration.public_endpoints": ["true", "false"],
  "orchestration.private_endpoints": ["true", "false"],
};

/** Edits one `orchestration.*` or `collab.*` setting; a change with a wide effect asks first (WEB-US-57). */
export function SettingDialog({
  setting,
  onClose,
  onSaved,
}: {
  setting: SettingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const settings = useService("settings");
  const initial = settingFieldText(setting.key, setting.value);
  const [text, setText] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [local, setLocal] = useState<string | undefined>();
  const isObject = setting.type === "object";
  const save = useMutation({
    mutationFn: () => {
      if (isObject) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return Promise.reject(new Error("not json"));
        }
        return settings.putValue(setting, parsed);
      }
      return settings.edit(
        setting,
        setting.key === "collab.allowed_source_cidrs" ? cidrLinesToList(text) : text,
      );
    },
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onSettled: () => setAsking(false),
  });
  const err = isAppError(save.error) ? save.error : undefined;
  const warn = orchestrationConfirmation(setting.key, initial, text);
  const go = () => {
    if (isObject) {
      try {
        JSON.parse(text);
      } catch {
        return setLocal("Not valid JSON");
      }
    }
    if (setting.key === "collab.allowed_source_cidrs") {
      const bad = badCidrs(text);
      if (bad.length > 0) return setLocal(`Not a CIDR range: ${bad.join(", ")}`);
    }
    setLocal(undefined);
    if (warn) setAsking(true);
    else save.mutate();
  };
  const choices = CHOICES[setting.key];
  return (
    <Modal
      title={asking ? `Confirm ${setting.key}` : `Edit ${setting.key}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {asking ? (
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              Confirm
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={save.isPending || err?.kind === "stale"}
              onClick={go}
            >
              Save
            </Button>
          )}
        </>
      }
    >
      {err?.isAccessDenied && <DeniedAlert error={err} />}
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
      {asking ? (
        <p>{warn}</p>
      ) : (
        <FormField
          label="Value"
          hint={`Allowed: ${setting.allowed}`}
          error={local ?? err?.fields.value}
        >
          {choices ? (
            <SelectInput
              value={text}
              options={choices.map((v) => ({ value: v, label: v }))}
              onChange={(e) => setText(e.target.value)}
            />
          ) : isObject || setting.key === "collab.allowed_source_cidrs" ? (
            <textarea
              rows={isObject ? 12 : 4}
              style={{ width: "100%" }}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          ) : (
            <TextInput value={text} onChange={(e) => setText(e.target.value)} />
          )}
        </FormField>
      )}
    </Modal>
  );
}
