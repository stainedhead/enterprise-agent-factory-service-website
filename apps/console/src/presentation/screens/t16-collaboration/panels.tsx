import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { CollaborationRecord } from "../../../application/ports/collaboration.js";
import { renderCli } from "../../../domain/cli.js";
import {
  CONDITION_TYPES,
  conditionView,
  managedByLabel,
  openPaperclipState,
  reasonText,
  type Surface,
  safeWebUrl,
  shortId,
  surfaceSwitch,
  surfaceView,
} from "../../../domain/collaboration.js";
import { putCollaborationCli } from "../../../domain/collaborationCli.js";
import {
  Badge,
  CliPreview,
  ConfirmDialog,
  CopyButton,
  KeyValue,
  LinkButton,
  StatusIndicator,
  Switch,
  Table,
} from "../../components/index.js";
import { useService } from "../../services.js";
import { managedSecretsKey, recentAccessKey } from "./keys.js";

/** The phase and the four conditions (WEB-US-44); `UnmanagedPaperclipAgents` is inverted. */
export function StatusPanel({ teamId, record }: { teamId: string; record: CollaborationRecord }) {
  return (
    <section aria-label="Status">
      <h2>Status</h2>
      <KeyValue
        items={[
          {
            label: "Collaboration agent",
            value: (
              <>
                <Link to={`/t/${teamId}/agents/${record.agentId}`}>{record.agentId}</Link>{" "}
                <Badge>Collaboration</Badge>
              </>
            ),
          },
          {
            label: "Phase",
            value: (
              <>
                <StatusIndicator
                  view={{ word: record.phase, dot: record.phase === "Ready" ? "green" : "amber" }}
                />{" "}
                gen {record.generation} / {record.observedGeneration}
                {record.observedGeneration < record.generation ? (
                  <span> Change not applied yet</span>
                ) : null}
              </>
            ),
          },
          {
            label: "Hostname",
            value: record.hostname ? (
              <>
                <code>{record.hostname}</code>{" "}
                <CopyButton text={record.hostname} label="Copy hostname" />
              </>
            ) : (
              <>— Not configured</>
            ),
          },
          {
            label: "Registration",
            value: record.registrationMode === "managed" ? "Managed" : "Manual",
          },
          {
            label: "Web UI",
            value: <StatusIndicator view={surfaceView(record.effective.webUi)} />,
          },
          {
            label: "REST API",
            value: <StatusIndicator view={surfaceView(record.effective.restApi)} />,
          },
          ...CONDITION_TYPES.map((t) => {
            const c = record.conditions.find((x) => x.type === t);
            const v = c ? conditionView(c) : undefined;
            return {
              label: t,
              value: v ? (
                <>
                  <StatusIndicator view={v} />
                  {c?.message ? <span> {c.message}</span> : null}
                </>
              ) : (
                "—"
              ),
            };
          }),
        ]}
      />
    </section>
  );
}

function SurfaceRow({
  label,
  stored,
  effective,
  reasons,
  url,
  manageReason,
  busy,
  onChange,
}: {
  label: string;
  stored: boolean;
  effective: boolean;
  reasons: readonly string[];
  url: string | null;
  manageReason: string | undefined;
  busy: boolean;
  onChange: (on: boolean) => void;
}) {
  const sw = surfaceSwitch({ stored, effective, reasons });
  const note = `${label}-note`;
  return (
    <div>
      <h3>{label}</h3>
      <Switch
        label={`${label} enabled`}
        checked={stored}
        busy={busy}
        disabledReason={manageReason ?? sw.disabledReason}
        describedBy={note}
        onChange={onChange}
      />{" "}
      <StatusIndicator view={sw.state} />
      <p id={note}>{sw.disabledReason ?? sw.notServing ?? ""}</p>
      {url && (
        <p>
          <code>{url}</code> <CopyButton text={url} label={`Copy ${label} address`} />
        </p>
      )}
    </div>
  );
}

/** The two switches, the addresses, *Open Paperclip* and the equivalent CLI command (WEB-US-44, 45). */
export function EndpointsPanel({
  teamId,
  record,
  suspended,
  canAccess,
  manageReason,
  busy,
  onSwitch,
}: {
  teamId: string;
  record: CollaborationRecord;
  suspended: boolean;
  canAccess: boolean;
  manageReason: string | undefined;
  busy: boolean;
  onSwitch: (s: Surface, on: boolean) => void;
}) {
  const [asking, setAsking] = useState<{ surface: Surface; on: boolean } | undefined>();
  const open = openPaperclipState({
    hostname: record.hostname,
    effectiveWebUi: record.effective.webUi,
    reasons: record.effective.reasons,
    teamState: suspended ? "suspended" : undefined,
    phase: record.phase,
    canAccess,
  });
  // turning a surface on asks first; turning it off is applied at once (WP-D4)
  const change = (surface: Surface, on: boolean) =>
    on ? setAsking({ surface, on }) : onSwitch(surface, on);
  const cmd = putCollaborationCli(teamId, {
    webUiEnabled: asking?.surface === "webUi" ? asking.on : record.webUiEnabled,
    restApiEnabled: asking?.surface === "restApi" ? asking.on : record.restApiEnabled,
  });
  return (
    <section aria-label="Endpoints">
      <h2>Endpoints</h2>
      <LinkButton
        href={safeWebUrl(record.webUiUrl)}
        {...(open.reason ? { disabledReason: open.reason } : {})}
      >
        Open Paperclip
      </LinkButton>
      <SurfaceRow
        label="Web UI"
        stored={record.webUiEnabled}
        effective={record.effective.webUi}
        reasons={record.effective.reasons}
        url={record.webUiUrl}
        manageReason={manageReason}
        busy={busy}
        onChange={(on) => change("webUi", on)}
      />
      <SurfaceRow
        label="REST API"
        stored={record.restApiEnabled}
        effective={record.effective.restApi}
        reasons={record.effective.reasons}
        url={record.restApiUrl}
        manageReason={manageReason}
        busy={busy}
        onChange={(on) => change("restApi", on)}
      />
      {record.effective.reasons.length > 0 && (
        <ul aria-label="Why a surface is off">
          {record.effective.reasons.map((r) => (
            <li key={r}>{reasonText(r)}</li>
          ))}
        </ul>
      )}
      <p>
        Equivalent command for team <code>{shortId(teamId)}</code>:
      </p>
      <CliPreview command={cmd} />
      <span hidden>{renderCli(cmd)}</span>
      {asking && (
        <ConfirmDialog
          title={`Turn on the ${asking.surface === "webUi" ? "web UI" : "REST API"}`}
          confirmLabel="Turn on"
          onCancel={() => setAsking(undefined)}
          onConfirm={() => {
            onSwitch(asking.surface, asking.on);
            setAsking(undefined);
          }}
        >
          Turning this on makes {asking.surface === "webUi" ? "Web UI" : "REST API"} reachable from
          the internet for people with an AFS role on this team. Every request is signed in and
          checked by AFS.
          <CliPreview command={cmd} />
        </ConfirmDialog>
      )}
    </section>
  );
}

/** The collaboration agent's managed secrets: names and metadata only (WEB-US-47). */
export function ManagedSecretsPanel({ teamId, agentId }: { teamId: string; agentId: string }) {
  const collab = useService("collaboration");
  const q = useQuery({
    queryKey: managedSecretsKey(teamId, agentId),
    queryFn: ({ signal }) => collab.managedSecrets(teamId, agentId, signal),
  });
  return (
    <section aria-label="Managed secrets">
      <h2>Managed secrets</h2>
      <Table
        id="collab-secrets"
        caption="Managed secrets"
        status={q.isPending ? "loading" : q.isError ? "error" : "ready"}
        error={isAppError(q.error) ? q.error.message : undefined}
        emptyText="No managed secrets yet."
        columns={[
          { id: "name", header: "Name", alwaysVisible: true, cell: (s) => s.name },
          {
            id: "by",
            header: "Managed by",
            cell: (s) => <Badge>{managedByLabel(s.managedBy)}</Badge>,
          },
          { id: "changed", header: "Last changed", cell: (s) => s.lastChangedAt ?? "—" },
        ]}
        items={q.data?.items ?? []}
        getRowId={(s) => s.id}
      />
      {q.data?.more && (
        <p>
          More on <Link to={`/t/${teamId}/secrets`}>Secrets</Link>.
        </p>
      )}
    </section>
  );
}

/** Sign-ins and requests of the last days, per person (WEB-US-49). */
export function RecentAccessPanel({ teamId }: { teamId: string }) {
  const collab = useService("collaboration");
  const q = useQuery({
    queryKey: recentAccessKey(teamId),
    queryFn: ({ signal }) => collab.recentAccess(teamId, signal),
  });
  return (
    <section aria-label="Recent access">
      <h2>Recent access</h2>
      {q.data && (
        <p>
          {q.data.signIns} sign-ins, {q.data.people} people, {q.data.denied} denied requests in the
          last 7 days.{" "}
          <Link to={`/t/${teamId}/reports?tab=collaboration&range=7d&groupBy=person`}>
            View all in Reports
          </Link>
        </p>
      )}
      <Table
        id="collab-access"
        caption="Recent access"
        status={q.isPending ? "loading" : q.isError ? "error" : "ready"}
        error={isAppError(q.error) ? q.error.message : undefined}
        emptyText="No access in this period."
        columns={[
          { id: "who", header: "Person", alwaysVisible: true, cell: (p) => p.label },
          { id: "in", header: "Sign-ins", cell: (p) => p.signIns },
          { id: "req", header: "Requests", cell: (p) => p.requests },
          { id: "den", header: "Denied", cell: (p) => p.deniedRequests },
        ]}
        items={q.data?.top ?? []}
        getRowId={(p) => p.id}
      />
    </section>
  );
}
