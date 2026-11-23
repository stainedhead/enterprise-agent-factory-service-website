import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  type AgentRow,
  agentPhases,
  isTemplateRetired,
  splitAgents,
} from "../../../application/usecases/agents/AgentsUseCases.js";
import { linkStateView, NOT_CONNECTED } from "../../../domain/collaboration.js";
import { modelsColumn } from "../../../domain/modelAccess.js";
import { format } from "../../../domain/money.js";
import { RUNTIME_TEXT } from "../../../domain/orchestration.js";
import { agentView } from "../../../domain/status.js";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  OrchestrationCard,
  OrchestrationMark,
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

/** The worker's link to the collaboration tool, as the *Collaboration* column and its filter read it. */
const linkView = (a: AgentRow) =>
  a.collaboration?.connect ? linkStateView(a.collaboration.linkState) : NOT_CONNECTED;

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
  const linkFilter = params.get("collaboration") ?? "";
  const all = list.data ?? [];
  const { orchestration, workers } = splitAgents(all);
  const rows = linkFilter
    ? workers.filter((a) => (linkFilter === "connected") === Boolean(a.collaboration?.connect))
    : workers;
  const selected = all.find((a) => a.id === agentId);
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: agentsKey(teamId) }),
  });
  const reason = write.reasonFor("agents:write");

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
        title={`Agents (${workers.length})`}
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
      {orchestration && (
        <OrchestrationCard label="Orchestration agent">
          <h2 style={{ margin: 0 }}>
            <OrchestrationMark />{" "}
            <Link to={`/t/${teamId}/orchestration`}>{orchestration.name}</Link>{" "}
            <Badge tone="orchestration">Orchestration</Badge>
          </h2>
          <p>
            <StatusIndicator view={agentView(orchestration)} /> · {RUNTIME_TEXT} ·{" "}
            {modelsColumn(orchestration.models)}
          </p>
          <Button
            disabledReason={reason}
            onClick={() => act.mutate(() => agents.restart(teamId, orchestration.id))}
          >
            Restart
          </Button>{" "}
          <Button
            disabledReason={reason}
            onClick={() =>
              act.mutate(() =>
                orchestration.paused
                  ? agents.resume(teamId, orchestration.id)
                  : agents.pause(teamId, orchestration.id),
              )
            }
          >
            {orchestration.paused ? "Resume" : "Pause"}
          </Button>{" "}
          <Button variant="primary" onClick={() => navigate(`/t/${teamId}/orchestration`)}>
            Manage orchestration
          </Button>
        </OrchestrationCard>
      )}
      <Card title="Team agents">
        <div>
          Collaboration{" "}
          <SelectInput
            aria-label="Collaboration"
            value={linkFilter}
            placeholder="Any collaboration state"
            options={[
              { value: "connected", label: "Connected" },
              { value: "not-connected", label: "Not connected" },
            ]}
            onChange={(e) => {
              const next = new URLSearchParams(params);
              if (e.target.value) next.set("collaboration", e.target.value);
              else next.delete("collaboration");
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
              cell: (a) => <Link to={`/t/${teamId}/agents/${a.id}`}>{a.name}</Link>,
            },
            {
              id: "status",
              header: "Status",
              sortValue: (a) => agentView(a).word,
              text: (a) => agentView(a).word,
              cell: (a) => <StatusIndicator view={agentView(a)} />,
            },
            {
              id: "collaboration",
              header: "Collaboration",
              sortValue: (a) => linkView(a).word,
              text: (a) => linkView(a).word,
              cell: (a) => <StatusIndicator view={linkView(a)} />,
            },
            {
              id: "model",
              header: "Model",
              sortValue: (a) => a.models.defaultModelId,
              cell: (a) => modelsColumn(a.models),
            },
            {
              id: "template",
              header: "Template",
              sortValue: (a) => a.template ?? "",
              cell: (a) => (
                <>
                  {a.template ?? "—"}{" "}
                  {isTemplateRetired(a) && <Badge tone="teal">Template retired</Badge>}
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
