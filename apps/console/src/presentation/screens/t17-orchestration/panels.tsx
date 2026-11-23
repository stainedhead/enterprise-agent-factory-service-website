import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { OrchestrationRecord } from "../../../application/ports/orchestration.js";
import { conditionView } from "../../../domain/collaboration.js";
import {
  CONDITION_TYPES,
  describeOrchestrationCli,
  exposureLabel,
  exposureView,
  managedByLabel,
  notApplicableText,
  openToolState,
  RUNTIME_TEXT,
  reasonText,
  SURFACE_LABEL,
  type Surface,
  safeWebUrl,
  shortId,
  toolInfo,
  toolLabel,
} from "../../../domain/orchestration.js";
import {
  Badge,
  CliPreview,
  CopyButton,
  KeyValue,
  LinkButton,
  OrchestrationMark,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { useService } from "../../services.js";
import { managedSecretsKey, recentAccessKey } from "./keys.js";

/** The tool, the phase and the four conditions (WEB-US-44); `UnmanagedToolAgents` is inverted. */
export function StatusPanel({ teamId, record }: { teamId: string; record: OrchestrationRecord }) {
  const info = toolInfo(record.tool);
  return (
    <section aria-label="Status">
      <h2>
        <OrchestrationMark /> Orchestration
      </h2>
      <KeyValue
        items={[
          {
            label: "Orchestration agent",
            value: (
              <>
                <Link to={`/t/${teamId}/orchestration/config`}>{record.agentName}</Link>{" "}
                <Badge tone="orchestration">Orchestration</Badge>
              </>
            ),
          },
          {
            label: "Collaboration tool",
            value: (
              <>
                {info.label}
                {record.toolVersion ? ` ${record.toolVersion}` : ""}{" "}
                {info.preview && <Badge tone="amber">Preview</Badge>}
              </>
            ),
          },
          { label: "Runtime", value: RUNTIME_TEXT },
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
            label: "Registration",
            value: record.registrationMode === "managed" ? "Managed" : "Manual",
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

function SurfaceTile({
  surface,
  record,
  label,
}: {
  surface: Surface;
  record: OrchestrationRecord;
  label: string;
}) {
  const sf = record[surface];
  const note = `${surface}-note`;
  const na = !sf.supported;
  return (
    <div>
      <h3>{label}</h3>
      {na ? (
        <p id={note}>{notApplicableText(record.tool, surface)}</p>
      ) : (
        <>
          <StatusIndicator view={exposureView(sf.effective)} />
          {sf.effective !== sf.exposure && (
            <p id={note}>
              Chosen: {exposureLabel(sf.exposure)}. In effect: {exposureLabel(sf.effective)}.
            </p>
          )}
          {sf.reasons.length > 0 && (
            <ul aria-label={`Why ${label} is limited`}>
              {sf.reasons.map((r) => (
                <li key={r}>{reasonText(r)}</li>
              ))}
            </ul>
          )}
          {sf.url && (
            <p>
              <code>{sf.url}</code> <CopyButton text={sf.url} label={`Copy ${label} address`} />
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** The two surfaces with their exposure, *Open <tool>* and the equivalent CLI command (WEB-US-44, 45). */
export function EndpointsPanel({
  teamId,
  record,
  suspended,
  canAccess,
}: {
  teamId: string;
  record: OrchestrationRecord;
  suspended: boolean;
  canAccess: boolean;
}) {
  const tool = toolLabel(record.tool);
  const open = openToolState({
    tool: record.tool,
    supported: record.webUi.supported,
    hostname: record.webUi.hostname,
    effective: record.webUi.effective,
    reasons: record.webUi.reasons,
    teamState: suspended ? "suspended" : undefined,
    phase: record.phase,
    canAccess,
  });
  return (
    <section aria-label="Endpoints">
      <h2>Endpoints</h2>
      <LinkButton
        href={safeWebUrl(record.webUi.url)}
        {...(open.reason ? { disabledReason: open.reason } : {})}
      >
        Open {tool}
      </LinkButton>
      <SurfaceTile surface="webUi" record={record} label={SURFACE_LABEL.webUi} />
      <SurfaceTile surface="webApi" record={record} label={SURFACE_LABEL.webApi} />
      <p>
        Equivalent command for team <code>{shortId(teamId)}</code>:
      </p>
      <CliPreview command={describeOrchestrationCli(teamId)} />
    </section>
  );
}

/** The orchestration agent's managed secrets: names and metadata only (WEB-US-47). */
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
