import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  classificationWord,
  createTeamMcpServerCli,
  emptyMcpDraft,
  type McpServerDraft,
  mcpAuthWord,
  STEP_FIELDS,
  stepErrors,
  submitMcpServerCli,
  TEAM_MCP_STEPS,
  TEAM_SERVERS_NOT_ALLOWED,
  transportWord,
  validateMcpServer,
} from "../../../domain/mcp.js";
import {
  Alert,
  Breadcrumbs,
  CliPreview,
  KeyValue,
  PageHeader,
  Wizard,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { type McpFieldsPart, McpServerFields } from "../sm-mcp/McpServerFields.js";
import { AREA, ErrorAlert, teamServersKey } from "../sm-mcp/shared.js";

const PARTS: readonly McpFieldsPart[] = ["details", "connection"];

/**
 * TM2 (screen 51, MCP-WEB-3): *Register team server*. It is created as a draft and submitted; the automatic checks
 * set the risk tier, which decides who approves under the service approval policy.
 */
export function RegisterTeamMcpPage() {
  const { teamId = "" } = useParams();
  const uc = useService("teamMcp");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const write = useTeamWriteGate(teamId).reasonFor("team-mcp-servers:write");
  const [draft, setDraft] = useState<McpServerDraft>(emptyMcpDraft("team"));
  // the Team resource does not carry mayAddMcpServers (contract note 11): the API's 403 says so instead
  const [notAllowed, setNotAllowed] = useState(false);
  const list = useQuery({
    queryKey: teamServersKey(teamId),
    queryFn: ({ signal }) => uc.servers(teamId, signal),
  });
  const taken = [...(list.data?.enterprise ?? []), ...(list.data?.team ?? [])].map(
    (t) => t.server.slug,
  );
  const errors = validateMcpServer(draft, "team", taken);
  const register = useMutation({
    mutationFn: async () => {
      const s = await uc.register(teamId, draft, { mayAdd: true, taken });
      return uc.submit(teamId, s.id);
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA, teamId) });
      navigate(`/t/${teamId}/mcp-servers/${s.id}`);
    },
    onError: (e) => {
      if (isAppError(e) && e.reason === "team_servers_not_allowed") setNotAllowed(true);
    },
  });
  const apiErr = isAppError(register.error) ? register.error : undefined;
  const denied = write ?? (notAllowed ? TEAM_SERVERS_NOT_ALLOWED : undefined);
  const shown = { ...errors, ...(apiErr?.fields ?? {}) };
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "MCP servers", to: `/t/${teamId}/mcp-servers` },
          { label: "Register team server" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Register team server"
        description="A server only this team uses. AFS proxies, pins and logs it like an enterprise server."
        infoHref="/docs/mcp-servers"
      />
      {denied && (
        <Alert kind="info" title={denied}>
          {notAllowed
            ? "A service admin allows a team to register its own servers in the team's gateway settings."
            : "Only a team-admin registers team servers."}
        </Alert>
      )}
      <ErrorAlert
        errors={[
          apiErr && Object.keys(apiErr.fields).length === 0 && !notAllowed ? apiErr : undefined,
        ]}
      />
      <Wizard
        steps={[
          ...PARTS.map((part, i) => {
            const title = TEAM_MCP_STEPS[i] ?? part;
            return {
              id: part,
              title,
              valid: Object.keys(stepErrors(title, errors)).length === 0,
              content: (
                <McpServerFields
                  scope="team"
                  part={part}
                  draft={draft}
                  errors={STEP_FIELDS[title] ? stepErrors(title, shown) : {}}
                  onChange={setDraft}
                />
              ),
            };
          }),
          {
            id: "inventory",
            title: TEAM_MCP_STEPS[2],
            valid: true,
            content: (
              <p>
                When you submit, AFS connects to the server, lists its tools, resources and prompts,
                pins each definition and runs the automatic checks. You see the inventory and the
                risk tier on the server's page.
              </p>
            ),
          },
        ]}
        review={
          <>
            <Alert kind="info" title="The checks decide who approves">
              A low-risk server may be approved by a team-admin under the default policy; elevated
              and high may need a security operator. Every approval is in the audit log and visible
              to security operators.
            </Alert>
            <KeyValue
              items={[
                { label: "Slug", value: <code>{draft.slug}</code> },
                { label: "Owner", value: draft.owner },
                { label: "Purpose", value: draft.purpose },
                {
                  label: "Data classification",
                  value: classificationWord(draft.dataClassification),
                },
                {
                  label: "Transport",
                  value: transportWord(
                    draft.transport,
                    draft.transport === "hosted" ? "in_namespace" : draft.location,
                  ),
                },
                {
                  label: draft.transport === "hosted" ? "Image" : "URL",
                  value: (
                    <code>{draft.transport === "hosted" ? draft.imageDigest : draft.url}</code>
                  ),
                },
                { label: "Authentication", value: mcpAuthWord(draft.authKind) },
                ...(draft.authKind === "workload_federation"
                  ? [{ label: "Audience", value: <code>{draft.audience}</code> }]
                  : []),
              ]}
            />
            <CliPreview command={createTeamMcpServerCli(teamId, draft)} />
            <CliPreview command={submitMcpServerCli(teamId, "<mcp-server-id>")} />
          </>
        }
        submitLabel={register.isPending ? "Submitting…" : "Register and submit"}
        onSubmit={() => {
          if (denied === undefined && Object.keys(errors).length === 0) register.mutate();
        }}
        onCancel={() => navigate(`/t/${teamId}/mcp-servers`)}
      />
    </div>
  );
}
