import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ImportReportRecord } from "../../../application/ports/adminExports.js";
import type { PreparedImport } from "../../../application/usecases/adminExports/AdminExportsUseCases.js";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  FormField,
  Table,
  TextInput,
} from "../../components/index.js";
import { useService } from "../../services.js";

interface Picked {
  readonly name: string;
  readonly size: number;
  readonly text: string;
}

/**
 * *Import* (WEB-US-21.2): a bundle and an optional account map. *Dry run* is the default and shows the plan per
 * team; *Apply* is enabled only for the inputs whose dry run was just read, and asks to confirm.
 */
export function ImportCard() {
  const exports = useService("adminExports");
  const [file, setFile] = useState<Picked>();
  const [fileError, setFileError] = useState<string>();
  const [mapText, setMapText] = useState("");
  const [plan, setPlan] = useState<{ hash: string; report: ImportReportRecord }>();
  const [applied, setApplied] = useState<ImportReportRecord>();
  const [confirm, setConfirm] = useState(false);

  // checked on every change: a refusal never reaches the API
  const prepared = useMemo<{ value?: PreparedImport; error?: string }>(() => {
    if (!file) return {};
    try {
      return { value: exports.prepare(file, mapText) };
    } catch (e) {
      return { error: isAppError(e) ? e.message : "The inputs are not valid" };
    }
  }, [exports, file, mapText]);
  const ready = prepared.value;
  const planned = ready !== undefined && plan?.hash === ready.hash;

  const dry = useMutation({
    mutationFn: async (p: PreparedImport) => ({ hash: p.hash, report: await exports.dryRun(p) }),
    onSuccess: (r) => {
      setPlan(r);
      setApplied(undefined);
    },
  });
  const apply = useMutation({
    mutationFn: (p: PreparedImport) => exports.apply(p, plan?.hash),
    onSuccess: setApplied,
    onSettled: () => setConfirm(false),
  });
  const err = [dry.error, apply.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  const shown = applied ?? (planned ? plan?.report : undefined);

  return (
    <Card title="Import">
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The import was not run"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField
        label="Bundle file"
        hint="An export bundle (JSON), up to 100 MB"
        error={fileError ?? prepared.error}
      >
        <input
          type="file"
          accept="application/json,.json"
          aria-label="Bundle file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setFileError(undefined);
            setPlan(undefined);
            setApplied(undefined);
            if (!f) return setFile(undefined);
            try {
              // an oversized file is refused from its size, before it is read
              setFile({
                name: f.name,
                size: f.size,
                text: f.size > 100 * 1024 * 1024 ? "" : await f.text(),
              });
            } catch {
              setFile(undefined);
              setFileError("The file could not be read");
            }
          }}
        />
      </FormField>
      <FormField
        label="Account map"
        hint="Optional. One source=target pair of 12-digit AWS account ids per line"
      >
        <TextInput value={mapText} onChange={(e) => setMapText(e.target.value)} />
      </FormField>
      <div style={{ margin: "12px 0" }}>
        <Button
          variant="primary"
          disabled={!ready || dry.isPending}
          onClick={() => ready && dry.mutate(ready)}
        >
          Dry run
        </Button>{" "}
        <Button
          disabled={!planned || apply.isPending}
          onClick={() => setConfirm(true)}
          {...(ready && !planned
            ? { disabledReason: "Run a dry run with these inputs first" }
            : {})}
        >
          Apply
        </Button>
      </div>
      {shown && (
        <Table
          id="import-plan"
          caption={shown.dryRun ? "Plan (dry run, nothing applied)" : "Applied"}
          filterLabel="Find teams"
          status="ready"
          emptyText="The bundle has no teams."
          columns={[
            {
              id: "slug",
              header: "Team",
              alwaysVisible: true,
              text: (t) => t.slug,
              cell: (t) => t.slug,
            },
            { id: "result", header: "Result", text: (t) => t.result, cell: (t) => t.result },
            {
              id: "changes",
              header: "Changes",
              text: (t) => t.changes.join(" "),
              cell: (t) =>
                t.error ? (
                  <span role="alert">{t.error}</span>
                ) : t.changes.length > 0 ? (
                  <ul style={{ margin: 0 }}>
                    {t.changes.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  "No changes"
                ),
            },
          ]}
          items={[...shown.teams]}
          getRowId={(t) => t.slug}
        />
      )}
      {confirm && ready && (
        <ConfirmDialog
          title="Apply the import"
          confirmLabel="Apply"
          onCancel={() => setConfirm(false)}
          onConfirm={() => apply.mutate(ready)}
        >
          <p>
            This applies the plan you just read to {plan?.report.teams.length ?? 0} team(s). It
            changes the service's desired state.
          </p>
        </ConfirmDialog>
      )}
    </Card>
  );
}
