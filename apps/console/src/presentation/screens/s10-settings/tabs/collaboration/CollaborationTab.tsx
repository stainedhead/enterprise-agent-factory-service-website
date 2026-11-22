import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../../../application/errors.js";
import type { SettingRecord } from "../../../../../application/ports/settings.js";
import { settingText } from "../../../../../application/usecases/settings/SettingsUseCases.js";
import {
  badCidrs,
  COLLAB_SETTING_KEYS,
  cidrLinesToList,
  collabConfirmation,
  collabFieldText,
  surfaceView,
} from "../../../../../domain/collaboration.js";
import { formatLocal } from "../../../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  FormField,
  Modal,
  SelectInput,
  StatusIndicator,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { ConflictAlert } from "../../../../query/ConflictAlert.js";
import { DeniedAlert } from "../../../../query/DeniedAlert.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";
import { downloadText } from "../../../t15-history/download.js";

const settingsKey = queryKey({ area: "settings", resource: "settings" });

const display = (s: SettingRecord) =>
  s.key === "collab.base_domain" && (s.value === null || s.value === "")
    ? "Not set. Public collaboration is off"
    : settingText(s.value) || "—";

/** S10 *Collaboration* (WEB-US-57): the seven `collab.*` settings and every team's endpoint. */
export function CollaborationTab() {
  const settings = useService("settings");
  const me = useMe();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) => settings.list(signal),
  });
  const [editing, setEditing] = useState<SettingRecord | undefined>();
  const denied = gate(me, "admin:settings");
  const items = COLLAB_SETTING_KEYS.map((k) => list.data?.find((s) => s.key === k)).filter(
    (s): s is SettingRecord => s !== undefined,
  );
  return (
    <>
      <Card title="Collaboration settings">
        <Table
          id="collab-settings"
          caption="Collaboration settings"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          columns={[
            {
              id: "key",
              header: "Key",
              alwaysVisible: true,
              cell: (s) => <code>{s.key}</code>,
              text: (s) => s.key,
            },
            { id: "value", header: "Value", cell: display, text: display },
            { id: "default", header: "Default", cell: (s) => settingText(s.default) || "—" },
            { id: "allowed", header: "Allowed", cell: (s) => s.allowed },
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
          items={items}
          getRowId={(s) => s.key}
        />
        {editing && (
          <EditCollabSetting
            setting={editing}
            onClose={() => setEditing(undefined)}
            onSaved={() => void qc.invalidateQueries({ queryKey: settingsKey })}
          />
        )}
      </Card>
      <EndpointsCard />
    </>
  );
}

function EditCollabSetting({
  setting,
  onClose,
  onSaved,
}: {
  setting: SettingRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const settings = useService("settings");
  const initial = collabFieldText(setting.key, setting.value);
  const [text, setText] = useState(initial);
  const [asking, setAsking] = useState(false);
  const [local, setLocal] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: () =>
      settings.edit(
        setting,
        setting.key === "collab.allowed_source_cidrs" ? cidrLinesToList(text) : text,
      ),
    onSuccess: () => {
      onSaved();
      onClose();
    },
    onSettled: () => setAsking(false),
  });
  const err = isAppError(save.error) ? save.error : undefined;
  const go = () => {
    if (setting.key === "collab.allowed_source_cidrs") {
      const bad = badCidrs(text);
      if (bad.length > 0) return setLocal(`Not a CIDR range: ${bad.join(", ")}`);
    }
    setLocal(undefined);
    if (collabConfirmation(setting.key, initial, text)) setAsking(true);
    else save.mutate();
  };
  const warn = collabConfirmation(setting.key, initial, text);
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
          {setting.key === "collab.public_endpoints" ? (
            <SelectInput
              value={text}
              options={[
                { value: "true", label: "true" },
                { value: "false", label: "false" },
              ]}
              onChange={(e) => setText(e.target.value)}
            />
          ) : setting.key === "collab.content_scan" ? (
            <SelectInput
              value={text}
              options={["block", "warn", "off"].map((v) => ({ value: v, label: v }))}
              onChange={(e) => setText(e.target.value)}
            />
          ) : setting.key === "collab.allowed_source_cidrs" ? (
            <textarea
              rows={4}
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

function EndpointsCard() {
  const collab = useService("collaboration");
  const [teamId, setTeamId] = useState("");
  const [state, setState] = useState("");
  const query = { ...(teamId.trim() && { teamId: teamId.trim() }), ...(state && { state }) };
  const q = useInfiniteQuery({
    queryKey: queryKey({ area: "collaboration", resource: "endpoints", id: `${teamId}|${state}` }),
    queryFn: ({ signal, pageParam }) =>
      collab.listEndpoints({ ...query, ...(pageParam ? { nextToken: pageParam } : {}) }, signal),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextToken,
  });
  const csv = useMutation({
    mutationFn: async () =>
      downloadText("collaboration-endpoints.csv", await collab.endpointsCsv(query)),
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const denied = isAppError(q.error) && q.error.isAccessDenied ? q.error : undefined;
  return (
    <Card title="Collaboration endpoints">
      {denied && <DeniedAlert error={denied} />}
      <FormField label="Team id">
        <TextInput value={teamId} onChange={(e) => setTeamId(e.target.value)} />
      </FormField>
      <FormField label="State">
        <SelectInput
          value={state}
          placeholder="All states"
          options={["Ready", "Degraded", "Failed", "Pending"].map((v) => ({ value: v, label: v }))}
          onChange={(e) => setState(e.target.value)}
        />
      </FormField>
      <Button disabled={csv.isPending} onClick={() => csv.mutate()}>
        Download CSV
      </Button>
      <Table
        id="collab-endpoints"
        caption="Collaboration endpoints"
        status={q.isPending ? "loading" : q.isError ? "error" : "ready"}
        error={isAppError(q.error) && !denied ? q.error.message : undefined}
        emptyText="No team has a collaboration agent yet."
        columns={[
          {
            id: "team",
            header: "Team",
            alwaysVisible: true,
            cell: (e) => <Link to={`/t/${e.teamId}/collaboration`}>{e.slug}</Link>,
            text: (e) => e.slug,
          },
          {
            id: "host",
            header: "Hostname",
            cell: (e) => (e.hostname ? <code>{e.hostname}</code> : "—"),
          },
          {
            id: "web",
            header: "Web UI",
            cell: (e) => <StatusIndicator view={surfaceView(e.webUi)} />,
          },
          {
            id: "api",
            header: "REST API",
            cell: (e) => <StatusIndicator view={surfaceView(e.restApi)} />,
          },
          { id: "state", header: "Team state", cell: (e) => e.teamState },
          { id: "phase", header: "Phase", cell: (e) => e.phase },
          {
            id: "may",
            header: "May publish",
            cell: (e) => (e.mayExposeCollaboration ? "Yes" : "No"),
          },
          {
            id: "last",
            header: "Last access",
            cell: (e) =>
              e.lastAccessAt ? (
                <time dateTime={e.lastAccessAt}>{formatLocal(e.lastAccessAt)}</time>
              ) : (
                "—"
              ),
          },
        ]}
        items={rows}
        getRowId={(e) => e.teamId}
      />
      {q.hasNextPage && (
        <Button disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          Load more
        </Button>
      )}
    </Card>
  );
}
