import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { TeamMcpServerRecord } from "../../../application/ports/mcp.js";
import {
  mcpAuthWord,
  modeWord,
  needsTeamCredential,
  putTeamMcpServerCli,
  putTeamMcpServerCredentialCli,
  reviewStatusView,
  TEAM_GATEWAY_REQUIRED,
  teamSwitchView,
  transportWord,
  usesOAuthConnect,
  usesSecretValue,
} from "../../../domain/mcp.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  PageHeader,
  SelectInput,
  StatusIndicator,
  Switch,
  Table,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { CredentialDialog } from "../sm-mcp/CredentialDialog.js";
import { AREA, ErrorAlert, num, RiskStatus, teamServersKey } from "../sm-mcp/shared.js";
import {
  OAuthOutcome,
  useGatewayDeployment,
  useTeamCallsByServer,
  ViewerBanner,
} from "./shared.js";

const GATEWAY_LINE = `Agents use these through the team gateway at \${AFS_GATEWAY_URL}/mcp. Agents hold no MCP credentials.`;

/**
 * *Connect* (MCP-WEB-3): the authorization URL opens in a new window and is not kept (the mutation returns
 * nothing); the API's callback brings the browser back with `?mcpOAuth=`.
 */
export function useConnect(teamId: string) {
  const uc = useService("teamMcp");
  return useMutation({
    mutationFn: async (t: TeamMcpServerRecord): Promise<void> => {
      const url = await uc.connectOAuth(teamId, t.server.id);
      window.open(url, "_blank", "noopener,noreferrer");
    },
  });
}

/** TM1 and VM1 (screens 50, 54; MCP-WEB-3): switch enterprise servers on, team servers, credentials, connect. */
export function TeamMcpServersPage({ viewer = false }: { viewer?: boolean }) {
  const { teamId = "" } = useParams();
  const uc = useService("teamMcp");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const writeGate = useTeamWriteGate(teamId);
  const write = writeGate.reasonFor("team-mcp-servers:write");
  const deployment = useGatewayDeployment(teamId);
  const calls = useTeamCallsByServer(teamId);
  const list = useQuery({
    queryKey: teamServersKey(teamId),
    queryFn: ({ signal }) => uc.servers(teamId, signal),
  });
  const [switching, setSwitching] = useState<{ t: TeamMcpServerRecord; on: boolean }>();
  const [mode, setMode] = useState<"full" | "read_only">("full");
  const [credential, setCredential] = useState<TeamMcpServerRecord>();
  const done = () => void qc.invalidateQueries({ queryKey: areaKey(AREA, teamId) });
  const put = useMutation({
    mutationFn: ({ t, on, m }: { t: TeamMcpServerRecord; on: boolean; m: "full" | "read_only" }) =>
      on ? uc.switchOn(teamId, t, m, deployment) : uc.switchOff(teamId, t),
    onSettled: () => {
      setSwitching(undefined);
      done();
    },
  });
  const connect = useConnect(teamId);
  const enterprise = list.data?.enterprise ?? [];
  const team = list.data?.team ?? [];
  const gatewayReason = deployment === "shared" ? TEAM_GATEWAY_REQUIRED : undefined;
  const reconnect = enterprise.filter(
    (t) => t.enabled && t.credential?.state === "expired" && usesOAuthConnect(t.server.authKind),
  );
  const status = list.isPending ? "loading" : list.isError ? "error" : "ready";
  const callsOf = (t: TeamMcpServerRecord) =>
    num(calls?.get(t.server.id) ?? calls?.get(t.server.slug));
  const credentialCell = (t: TeamMcpServerRecord) => {
    const k = t.server.authKind;
    const act =
      viewer || !t.enabled ? null : usesOAuthConnect(k) ? (
        <Button
          variant="link"
          disabledReason={write}
          disabled={connect.isPending}
          onClick={() => connect.mutate(t)}
        >
          {t.credential?.state === "set" ? "Reconnect" : "Connect"}
        </Button>
      ) : usesSecretValue(k) && needsTeamCredential(t) ? (
        <Button variant="link" disabledReason={write} onClick={() => setCredential(t)}>
          Set credential
        </Button>
      ) : null;
    return (
      <>
        <StatusIndicator view={teamSwitchView(t)} /> {act}
      </>
    );
  };
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "MCP servers" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      {viewer && <ViewerBanner />}
      <PageHeader
        title="MCP servers"
        description={GATEWAY_LINE}
        infoHref="/docs/mcp-servers"
        actions={
          <Button
            variant="primary"
            disabledReason={write}
            onClick={() => navigate(`/t/${teamId}/mcp-servers/new`)}
          >
            Register team server
          </Button>
        }
      />
      <OAuthOutcome onSeen={done} />
      <ErrorAlert errors={[list.error, put.error, connect.error]} />
      {gatewayReason && (
        <Alert kind="info" title="This team uses the shared gateway">
          {gatewayReason}. Switching a server on needs the team's own gateway.
        </Alert>
      )}
      {!viewer &&
        reconnect.map((t) => (
          <Alert key={t.server.id} kind="warning" title={`${t.server.slug} needs reconnecting.`}>
            Agents get a "reconnect needed" tool error until a team-admin reconnects.{" "}
            <Button
              variant="link"
              disabledReason={write}
              disabled={connect.isPending}
              onClick={() => connect.mutate(t)}
            >
              Reconnect
            </Button>
          </Alert>
        ))}
      <Card
        title={`Enterprise servers (${enterprise.filter((t) => t.enabled).length} of ${enterprise.length} on)`}
      >
        <p>
          Reviewed and published by service admins. Switch on only what the team uses; Read-only
          allows read-only tools, resources and prompts.
        </p>
        <Table
          id="team-mcp-enterprise"
          caption="Enterprise servers"
          filterLabel="Find servers"
          status={status}
          emptyText="No enterprise server is published yet."
          items={enterprise}
          getRowId={(t) => t.server.id}
          columns={[
            {
              id: "on",
              header: "On",
              alwaysVisible: true,
              text: (t) => (t.enabled ? "on" : "off"),
              cell: (t) => (
                <Switch
                  label={`${t.server.slug} on for the team`}
                  checked={t.enabled}
                  busy={put.isPending}
                  disabledReason={
                    write ??
                    (t.server.reviewStatus === "suspended"
                      ? "Suspended by a service admin"
                      : !t.enabled
                        ? gatewayReason
                        : undefined)
                  }
                  onChange={(on) => {
                    setMode("full");
                    setSwitching({ t, on });
                  }}
                />
              ),
            },
            {
              id: "server",
              header: "Server",
              alwaysVisible: true,
              sortValue: (t) => t.server.slug,
              cell: (t) => (
                <>
                  <Link to={`/t/${teamId}/mcp-servers/${t.server.id}`}>
                    <code>{t.server.slug}</code>
                  </Link>
                  <div>{t.server.displayName}</div>
                </>
              ),
            },
            {
              id: "mode",
              header: "Mode",
              cell: (t) =>
                t.enabled ? (
                  <SelectInput
                    aria-label={`Mode for ${t.server.slug}`}
                    aria-disabled={write !== undefined || undefined}
                    value={t.mode}
                    options={[
                      { value: "full", label: "Full" },
                      { value: "read_only", label: "Read-only" },
                    ]}
                    onChange={(e) =>
                      write === undefined &&
                      put.mutate({ t, on: true, m: e.target.value as "full" | "read_only" })
                    }
                  />
                ) : (
                  "—"
                ),
              text: (t) => modeWord(t.mode),
            },
            { id: "auth", header: "Auth to server", cell: (t) => mcpAuthWord(t.server.authKind) },
            {
              id: "credential",
              header: "Credential",
              text: (t) => teamSwitchView(t).word,
              cell: credentialCell,
            },
            { id: "calls", header: "Calls", cell: callsOf },
          ]}
        />
      </Card>
      <Card title={`Team-managed servers (${team.length})`}>
        <p>
          Registered by this team (allowed by a service admin). Proxied, pinned, audited and
          reported like enterprise servers.
        </p>
        <Table
          id="team-mcp-own"
          caption="Team-managed servers"
          status={status}
          emptyText="This team has registered no server."
          items={team}
          getRowId={(t) => t.server.id}
          columns={[
            {
              id: "server",
              header: "Server",
              alwaysVisible: true,
              sortValue: (t) => t.server.slug,
              cell: (t) => (
                <Link to={`/t/${teamId}/mcp-servers/${t.server.id}`}>
                  <code>{t.server.slug}</code>
                </Link>
              ),
            },
            {
              id: "transport",
              header: "Transport",
              cell: (t) => transportWord(t.server.transport, t.server.location),
            },
            { id: "risk", header: "Risk", cell: (t) => <RiskStatus tier={t.server.riskTier} /> },
            {
              id: "review",
              header: "Review",
              text: (t) => reviewStatusView(t.server).word,
              cell: (t) => <StatusIndicator view={reviewStatusView(t.server)} />,
            },
            { id: "owner", header: "Owner", cell: (t) => t.server.owner ?? "—" },
            {
              id: "on",
              header: "Switch",
              cell: (t) => <StatusIndicator view={teamSwitchView(t)} />,
              text: (t) => teamSwitchView(t).word,
            },
            { id: "calls", header: "Calls", cell: callsOf },
          ]}
        />
      </Card>
      {switching && (
        <ConfirmDialog
          title={`${switching.on ? "Switch on" : "Switch off"} ${switching.t.server.slug}`}
          confirmLabel={switching.on ? "Switch on" : "Switch off"}
          onConfirm={() => put.mutate({ t: switching.t, on: switching.on, m: mode })}
          onCancel={() => setSwitching(undefined)}
        >
          {switching.on ? (
            <>
              <fieldset style={{ border: 0, padding: 0 }}>
                <legend>Mode</legend>
                {(["full", "read_only"] as const).map((m) => (
                  <label key={m} style={{ display: "block" }}>
                    <input
                      type="radio"
                      name="team-mcp-mode"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                    />{" "}
                    {modeWord(m)}
                  </label>
                ))}
              </fieldset>
              {needsTeamCredential(switching.t) && (
                <p>
                  Calls wait for the team's credential: set it or connect once the server is on.
                </p>
              )}
            </>
          ) : (
            <p>Every agent of the team loses this server at once; pods roll with the new list.</p>
          )}
          <CliPreview
            command={putTeamMcpServerCli(teamId, switching.t.server.id, switching.on, mode)}
          />
        </ConfirmDialog>
      )}
      {credential && (
        <CredentialDialog
          title={`Set credential · ${credential.server.slug}`}
          authKind={credential.server.authKind}
          cli={putTeamMcpServerCredentialCli(
            teamId,
            credential.server.id,
            credential.server.authKind,
          )}
          save={(c) => uc.setCredential(teamId, credential.server.id, c)}
          onSaved={done}
          onClose={() => setCredential(undefined)}
        />
      )}
    </div>
  );
}
