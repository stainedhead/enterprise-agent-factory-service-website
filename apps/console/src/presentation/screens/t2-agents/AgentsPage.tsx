import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  type AgentRow,
  agentPhases,
  isTemplateRetired,
} from "../../../application/usecases/agents/AgentsUseCases.js";
import { linkStateView, NOT_CONNECTED } from "../../../domain/collaboration.js";
import { format } from "../../../domain/money.js";
import { agentView } from "../../../domain/status.js";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  PageHeader,
  SelectInput,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { AgentPanel } from "./AgentPanel.js";
import { agentsKey } from "./keys.js";

const paperclipView = (a: AgentRow) =>
  a.role === "collaboration"
    ? { word: "—", dot: "grey" as const }
    : a.collaboration?.connect
      ? linkStateView(a.collaboration.linkState)
      : NOT_CONNECTED;

const noun = (n: number) => `${n} ${n === 1 ? "secret" : "secrets"}`;

/** T2 (WEB-US-25): the team's agents with a detail panel; one list request per polling interval (WD-21). */
export function AgentsPage() {
  const { teamId = "", agentId } = useParams();
  const navigate = useNavigate();
  const agents = useService("agents");
  const write = useTeamWriteGate(teamId);
  const list = usePolledQuery<readonly AgentRow[]>({
    queryKey: agentsKey(teamId),
    queryFn: ({ signal }) => agents.list(teamId, signal),
    phasesOf: agentPhases,
  });
  const [params, setParams] = useSearchParams();
  const roleFilter = params.get("role") ?? "";
  const all = list.data ?? [];
  const rows = roleFilter ? all.filter((a) => (a.role ?? "worker") === roleFilter) : all;
  const selected = all.find((a) => a.id === agentId);

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Agents" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title={`Agents (${rows.length})`}
        description="Containerized agents in this team's namespace. Model calls go through the metering gateway."
        infoHref="/docs/agents"
        actions={
          <Button
            variant="primary"
            disabledReason={write.reasonFor("agents:write")}
            onClick={() => navigate(`/t/${teamId}/agents/new`)}
          >
            Create agent
          </Button>
        }
      />
      <Card>
        <div>
          Role{" "}
          <SelectInput
            aria-label="Role"
            value={roleFilter}
            placeholder="All roles"
            options={[
              { value: "worker", label: "Worker" },
              { value: "collaboration", label: "Collaboration" },
            ]}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set("role", e.target.value);
              else next.delete("role");
              setParams(next, { replace: true });
            }}
          />
        </div>
        <Table
          id="team-agents"
          caption="Agents"
          filterLabel="Find agents"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="This team has no agents yet."
          selection={{
            mode: "single",
            selected: selected ? [selected.id] : [],
            onChange: (ids) => {
              const id = ids[0];
              navigate(id ? `/t/${teamId}/agents/${id}` : `/t/${teamId}/agents`);
            },
          }}
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (a) => a.name,
              cell: (a) => (
                <>
                  <Link to={`/t/${teamId}/agents/${a.id}`}>{a.name}</Link>{" "}
                  {a.role === "collaboration" && <Badge tone="blue">Collaboration</Badge>}
                </>
              ),
            },
            {
              id: "status",
              header: "Status",
              sortValue: (a) => agentView(a).word,
              text: (a) => agentView(a).word,
              cell: (a) => <StatusIndicator view={agentView(a)} />,
            },
            {
              id: "paperclip",
              header: "Paperclip",
              sortValue: (a) => paperclipView(a).word,
              text: (a) => paperclipView(a).word,
              cell: (a) =>
                a.role === "collaboration" ? "—" : <StatusIndicator view={paperclipView(a)} />,
            },
            { id: "model", header: "Model", sortValue: (a) => a.modelId, cell: (a) => a.modelId },
            {
              id: "template",
              header: "Template",
              sortValue: (a) => a.template,
              cell: (a) => (
                <>
                  {a.template}{" "}
                  {isTemplateRetired(a) && <Badge tone="purple">Template retired</Badge>}
                </>
              ),
            },
            {
              id: "secrets",
              header: "Secrets",
              sortValue: (a) => a.secretBindings.length,
              text: (a) => noun(a.secretBindings.length),
              cell: (a) => noun(a.secretBindings.length),
            },
            {
              id: "cost",
              header: "Cost, month to date",
              sortValue: (a) => Number(a.costUsd ?? 0),
              cell: (a) => (a.costUsd === undefined ? "—" : format(a.costUsd)),
            },
          ]}
          items={rows}
          getRowId={(a) => a.id}
        />
      </Card>
      {agentId && !list.isPending && !selected && (
        <p role="alert">Agent {agentId} was not found in this team.</p>
      )}
      {selected && <AgentPanel teamId={teamId} agent={selected} />}
    </div>
  );
}
