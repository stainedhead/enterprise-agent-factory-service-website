import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { McpPrimitiveRecord, TeamMcpServerRecord } from "../../../application/ports/mcp.js";
import {
  classificationWord,
  mcpAuthWord,
  modeWord,
  primitiveStatusView,
  putTeamMcpPolicyCli,
  putTeamMcpServerCredentialCli,
  reviewCli,
  reviewStatusView,
  startMcpOAuthCli,
  submitMcpServerCli,
  teamApproveBlock,
  teamSwitchView,
  testMcpFederationCli,
  transportWord,
  usesOAuthConnect,
  usesSecretValue,
} from "../../../domain/mcp.js";
import { can } from "../../../domain/me.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  KeyValue,
  PageHeader,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { CredentialDialog } from "../sm-mcp/CredentialDialog.js";
import { PolicyEditor } from "../sm-mcp/PolicyEditor.js";
import {
  AREA,
  ChecksList,
  ErrorAlert,
  KindBadge,
  primitiveColumns,
  RiskStatus,
  teamServerKey,
} from "../sm-mcp/shared.js";
import { OAuthOutcome, ViewerBanner } from "./shared.js";
import { useConnect } from "./TeamMcpServersPage.js";

/** TM3 (screens 50, 51; MCP-WEB-3): one server as the team sees it: credential, connect, federation, review. */
export function TeamMcpServerPage() {
  const { teamId = "", mcpServerId = "" } = useParams();
  const uc = useService("teamMcp");
  const me = useMe();
  const qc = useQueryClient();
  const gate = useTeamWriteGate(teamId);
  const write = gate.reasonFor("team-mcp-servers:write");
  const viewer = !can(me, "team-mcp-servers:write", teamId);
  const q = useQuery({
    queryKey: teamServerKey(teamId, mcpServerId),
    queryFn: ({ signal }) => uc.detail(teamId, mcpServerId, signal),
  });
  const done = () => void qc.invalidateQueries({ queryKey: areaKey(AREA, teamId) });
  const t = q.data;
  if (q.isError && isAppError(q.error) && q.error.kind === "not-found")
    return <NotFoundPage team />;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "MCP servers", to: `/t/${teamId}/mcp-servers` },
          { label: t?.server.slug ?? mcpServerId },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      {viewer && <ViewerBanner />}
      <OAuthOutcome onSeen={done} />
      <ErrorAlert errors={[q.error]} />
      {t && (
        <>
          <PageHeader
            title={t.server.slug}
            description={`${t.server.displayName}. ${t.server.purpose ?? ""}`}
            infoHref="/docs/mcp-servers"
            actions={
              <>
                <KindBadge scope={t.server.scope} />{" "}
                <StatusIndicator view={reviewStatusView(t.server)} />{" "}
                <StatusIndicator view={teamSwitchView(t)} />
              </>
            }
          />
          <Card title="Server">
            <KeyValue
              items={[
                { label: "Transport", value: transportWord(t.server.transport, t.server.location) },
                {
                  label: t.server.transport === "hosted" ? "Image" : "URL",
                  value: (
                    <code>
                      {t.server.transport === "hosted"
                        ? t.server.hosted?.imageDigest
                        : t.server.url}
                    </code>
                  ),
                },
                { label: "Authentication", value: mcpAuthWord(t.server.authKind) },
                { label: "Mode", value: t.enabled ? modeWord(t.mode) : "Off" },
                {
                  label: "Data classification",
                  value: classificationWord(t.server.dataClassification),
                },
                { label: "Owner", value: t.server.owner ?? "—" },
                { label: "Risk", value: <RiskStatus tier={t.server.riskTier} /> },
              ]}
            />
          </Card>
          <CredentialCard teamId={teamId} t={t} write={write} onDone={done} />
          {t.managed === "team" && <ReviewCard teamId={teamId} t={t} write={write} onDone={done} />}
          <TeamInventory teamId={teamId} t={t} onDone={done} />
          {t.enabled && (
            <PolicyEditor
              title="Team policy"
              intro="Rules for this team's agents. They can only narrow the service policy. Saving replaces the stored team rules."
              reason={write}
              save={(rules) => uc.putPolicy(teamId, t.server.id, rules)}
              cliFor={(rules) => putTeamMcpPolicyCli(teamId, t.server.id, rules)}
              onSaved={done}
            />
          )}
        </>
      )}
    </div>
  );
}

function CredentialCard({
  teamId,
  t,
  write,
  onDone,
}: {
  teamId: string;
  t: TeamMcpServerRecord;
  write: string | undefined;
  onDone: () => void;
}) {
  const uc = useService("teamMcp");
  const connect = useConnect(teamId);
  const [setting, setSetting] = useState(false);
  const disconnect = useMutation({
    mutationFn: () => uc.disconnectOAuth(teamId, t.server.id),
    onSettled: onDone,
  });
  const test = useMutation({
    mutationFn: () => uc.testFederation(teamId, t.server.id),
    onSettled: onDone,
  });
  const k = t.server.authKind;
  const fed = t.server.federation;
  return (
    <Card title="Credential">
      <ErrorAlert errors={[connect.error, disconnect.error, test.error]} />
      <KeyValue
        items={[
          { label: "State", value: <StatusIndicator view={teamSwitchView(t)} /> },
          ...(t.credential?.subject
            ? [{ label: "Connected as", value: t.credential.subject }]
            : []),
          ...(t.credential?.scopes && t.credential.scopes.length > 0
            ? [{ label: "Scopes", value: <code>{t.credential.scopes.join(" ")}</code> }]
            : []),
        ]}
      />
      {usesOAuthConnect(k) && (
        <>
          <p>
            Connect a service account in the SaaS, never a named person. The sign-in opens in a new
            window; the gateway keeps the refresh token.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Button
              variant="primary"
              disabledReason={write ?? (t.enabled ? undefined : "Switch the server on first")}
              disabled={connect.isPending}
              onClick={() => connect.mutate(t)}
            >
              {t.credential?.state === "set" ? "Reconnect" : "Connect"}
            </Button>
            <Button
              disabledReason={
                write ?? (t.credential?.state === "set" ? undefined : "Not connected")
              }
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate()}
            >
              Disconnect
            </Button>
          </div>
          <CliPreview command={startMcpOAuthCli(teamId, t.server.id)} />
        </>
      )}
      {usesSecretValue(k) && (
        <>
          <p>
            {t.server.credentialMode === "shared"
              ? "A service admin set one shared credential for every team."
              : "Write-only. The team gateway keeps it; agents cannot read it."}
          </p>
          {t.server.credentialMode !== "shared" && (
            <Button variant="primary" disabledReason={write} onClick={() => setSetting(true)}>
              Set credential
            </Button>
          )}
        </>
      )}
      {k === "workload_federation" && (
        <>
          <p>
            Nothing is stored: the team gateway exchanges its own projected token for a short-lived
            access token on each call. Register this trust once in the target IdP.
          </p>
          {fed && (
            <pre>
              {`issuer:   ${fed.issuer}\naudience: ${fed.audience}\nsubject:  ${fed.subjectTemplate ?? "the team gateway's service account"}`}
            </pre>
          )}
          <Button disabledReason={write} disabled={test.isPending} onClick={() => test.mutate()}>
            Test exchange
          </Button>
          {test.data && (
            <Alert
              kind={test.data.federationState === "ok" ? "success" : "error"}
              title={
                test.data.federationState === "ok"
                  ? "Test exchange succeeded"
                  : "The exchange failed"
              }
            >
              {test.data.federationState === "ok"
                ? "The gateway can mint tokens for this server."
                : "Check the trust registered in the target IdP."}
            </Alert>
          )}
          <CliPreview command={testMcpFederationCli(teamId, t.server.id)} />
        </>
      )}
      {(k === "none" || k === "aws_sigv4") && (
        <p>
          {k === "none"
            ? "No credential: network policy is the guard."
            : "Signed with the team gateway's role; nothing is stored."}
        </p>
      )}
      {setting && (
        <CredentialDialog
          title={`Set credential · ${t.server.slug}`}
          authKind={k}
          cli={putTeamMcpServerCredentialCli(teamId, t.server.id, k)}
          save={(c) => uc.setCredential(teamId, t.server.id, c)}
          onSaved={onDone}
          onClose={() => setSetting(false)}
        />
      )}
    </Card>
  );
}

function ReviewCard({
  teamId,
  t,
  write,
  onDone,
}: {
  teamId: string;
  t: TeamMcpServerRecord;
  write: string | undefined;
  onDone: () => void;
}) {
  const uc = useService("teamMcp");
  const navigate = useNavigate();
  const gate = useTeamWriteGate(teamId);
  const approveReason = gate.reasonFor("team-mcp-servers:approve");
  const [deciding, setDeciding] = useState<"approve" | "reject" | "delete">();
  const s = t.server;
  const act = useMutation({
    mutationFn: async ({ what, note }: { what: string; note?: string | undefined }) => {
      if (what === "submit") return uc.submit(teamId, s.id);
      if (what === "approve") return uc.approve(teamId, s, { note: note ?? "" });
      if (what === "reject") return uc.reject(teamId, s, { note: note ?? "" });
      if (what === "refresh") return uc.refresh(teamId, s.id);
      await uc.delete(teamId, s);
      navigate(`/t/${teamId}/mcp-servers`);
      return undefined;
    },
    onSettled: () => {
      setDeciding(undefined);
      onDone();
    },
  });
  const block = approveReason ?? teamApproveBlock(s);
  return (
    <Card title="Review">
      <ErrorAlert errors={[act.error]} title="The change was not made" />
      <KeyValue
        items={[
          { label: "Status", value: <StatusIndicator view={reviewStatusView(s)} /> },
          { label: "Risk tier", value: <RiskStatus tier={s.riskTier} /> },
          {
            label: "Approver",
            value:
              s.approver === "security"
                ? "A security operator or service admin (approval policy)"
                : s.approver === "team_admin"
                  ? "A team-admin of this team"
                  : "—",
          },
        ]}
      />
      {(s.riskReasons ?? []).length > 0 && (
        <ul>
          {(s.riskReasons ?? []).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <ChecksList checks={s.checks ?? []} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <Button
          disabledReason={write}
          disabled={act.isPending}
          onClick={() => act.mutate({ what: "refresh" })}
        >
          Refresh inventory
        </Button>
        <Button
          disabledReason={
            write ??
            (s.reviewStatus === "draft" || s.reviewStatus === "rejected"
              ? undefined
              : "Already submitted")
          }
          disabled={act.isPending}
          onClick={() => act.mutate({ what: "submit" })}
        >
          Submit for review
        </Button>
        <Button disabledReason={block} onClick={() => setDeciding("reject")}>
          Reject
        </Button>
        <Button variant="primary" disabledReason={block} onClick={() => setDeciding("approve")}>
          Approve
        </Button>
        <Button disabledReason={write} onClick={() => setDeciding("delete")}>
          Delete
        </Button>
      </div>
      <CliPreview command={submitMcpServerCli(teamId, s.id)} />
      {(deciding === "approve" || deciding === "reject") && (
        <ConfirmDialog
          title={`${deciding === "approve" ? "Approve" : "Reject"} ${s.slug}`}
          confirmLabel={deciding === "approve" ? "Approve" : "Reject"}
          withNote={{ label: "Decision note (recorded in the audit log)", required: true }}
          onConfirm={(note) => act.mutate({ what: deciding, note })}
          onCancel={() => setDeciding(undefined)}
        >
          <p>
            {deciding === "approve"
              ? "The server becomes callable for this team's agents; the approval is visible to security operators."
              : "The server stays unusable; the team may change and resubmit it."}
          </p>
          <CliPreview command={reviewCli(deciding, s.id, "<note>", [], teamId)} />
        </ConfirmDialog>
      )}
      {deciding === "delete" && (
        <ConfirmDialog
          title={`Delete ${s.slug}`}
          confirmLabel="Delete"
          onConfirm={() => act.mutate({ what: "delete" })}
          onCancel={() => setDeciding(undefined)}
        >
          <p>Agents lose the server at once. The API refuses while an agent still selects it.</p>
        </ConfirmDialog>
      )}
    </Card>
  );
}

function TeamInventory({
  teamId,
  t,
  onDone,
}: {
  teamId: string;
  t: TeamMcpServerRecord;
  onDone: () => void;
}) {
  const uc = useService("teamMcp");
  const gate = useTeamWriteGate(teamId);
  const approveReason = gate.reasonFor("team-mcp-servers:approve");
  const prims = useQuery({
    queryKey: [...teamServerKey(teamId, t.server.id), "primitives"],
    queryFn: ({ signal }) => uc.primitives(teamId, t.server.id, signal),
  });
  const decide = useMutation({
    mutationFn: ({ p, d }: { p: McpPrimitiveRecord; d: "approve" | "reject" }) =>
      uc.decidePrimitive(teamId, t.server.id, p.id, d),
    onSettled: onDone,
  });
  const items = prims.data ?? [];
  // held definitions of a team server are decided by the team; enterprise ones by service reviewers
  const teamDecides = t.managed === "team";
  return (
    <Card title={`Inventory (${items.length})`}>
      <ErrorAlert errors={[prims.error, decide.error]} />
      <Table
        id="team-mcp-inventory"
        caption="Tools, resources and prompts"
        filterLabel="Find tools, resources, prompts"
        status={prims.isPending ? "loading" : prims.isError ? "error" : "ready"}
        emptyText="No inventory yet."
        items={items}
        getRowId={(p) => p.id}
        columns={[
          ...primitiveColumns<McpPrimitiveRecord>(),
          {
            id: "status",
            header: "Status",
            text: (p) => primitiveStatusView(p).word,
            cell: (p) => <StatusIndicator view={primitiveStatusView(p)} />,
          },
          ...(teamDecides
            ? [
                {
                  id: "decide",
                  header: "Decision",
                  cell: (p: McpPrimitiveRecord) =>
                    p.status === "pending_review" ? (
                      <span style={{ display: "flex", gap: 4 }}>
                        <Button
                          aria-label={`Approve ${p.name}`}
                          disabledReason={approveReason}
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ p, d: "approve" })}
                        >
                          Approve
                        </Button>
                        <Button
                          aria-label={`Reject ${p.name}`}
                          disabledReason={approveReason}
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ p, d: "reject" })}
                        >
                          Reject
                        </Button>
                      </span>
                    ) : (
                      "—"
                    ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}
