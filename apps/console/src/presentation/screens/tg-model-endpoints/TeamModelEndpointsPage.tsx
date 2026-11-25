import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { InferenceReportUseCases } from "../../../application/usecases/modelEndpoints/ModelEndpointsUseCases.js";
import { TEAM_ENDPOINTS_NOT_ALLOWED } from "../../../domain/modelEndpoints.js";
import { Alert, Breadcrumbs, Button, Card, KeyValue, PageHeader } from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { ErrorAlert, usd } from "../sg-model-endpoints/shared.js";
import { ServiceRoutes, TeamEndpoints, useTeamRoutes } from "./RouteTables.js";

/** TG1 and VG1 (screens 61, 66; MEG-WEB-3, -4): the routes this team's agents can call through its gateway. */
export function TeamModelEndpointsPage({ viewer = false }: { viewer?: boolean }) {
  const { teamId = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const routes = useTeamRoutes(teamId);
  const reports = useOptionalService("inferenceReports");
  const spend = useQuery({
    queryKey: queryKey({ area: "inference-report", teamId, resource: "spend-by-route" }),
    queryFn: ({ signal }) =>
      reports
        ? reports.run({ level: "team", teamId }, { range: "mtd", groupBy: ["route"] }, signal)
        : Promise.reject(new Error("no reports service")),
    enabled: reports !== undefined,
    retry: false,
  });
  const byRoute = spend.data ? InferenceReportUseCases.spendByRoute(spend.data) : undefined;
  const writeReason = gate(me, "model-endpoints:write", teamId);
  const r = routes.data;
  const createReason =
    writeReason ?? (r && !r.mayAddModelEndpoints ? TEAM_ENDPOINTS_NOT_ALLOWED : undefined);
  const total = r ? r.selected.length + r.own.length : 0;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Model endpoints" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      {viewer && (
        <Alert kind="info" title="Read-only access">
          You can view this team's routes. Controls that change them are disabled and name the role
          they need.
        </Alert>
      )}
      <PageHeader
        title="Model endpoints"
        description="Routes this team's agents can call through the team gateway. No upstream credential ever reaches an agent."
        infoHref="/docs/model-endpoints"
        actions={
          <Button
            variant="primary"
            disabledReason={createReason}
            onClick={() => navigate(`/t/${teamId}/model-endpoints/new`)}
          >
            Create endpoint
          </Button>
        }
      />
      <ErrorAlert errors={[routes.error]} />
      {r?.selected
        .filter((e) => e.health?.state === "Degraded")
        .map((e) => (
          <Alert key={e.id} kind="warning" title={`${e.slug} is degraded`}>
            {e.health?.reason ?? "Calls still flow."} Agents with another route may switch per call;
            AFS does not move traffic for them.
          </Alert>
        ))}
      <Card title="Team gateway">
        <KeyValue
          items={[
            {
              label: "Deployment",
              value: r
                ? r.gatewayDeployment === "per_namespace"
                  ? "Team gateway in the team's namespace"
                  : "Shared gateway"
                : "—",
            },
            {
              label: "Routes",
              value: r
                ? `${total} (${r.selected.length} from the service, ${r.own.length} declared by the team)`
                : "—",
            },
            {
              label: "Route spend, month to date",
              value: spend.data ? usd(spend.data.totals.costUsd) : "—",
            },
            {
              label: "Team endpoints",
              value: r
                ? r.mayAddModelEndpoints
                  ? "Allowed by service admins"
                  : "Not allowed"
                : "—",
            },
          ]}
        />
      </Card>
      <ServiceRoutes
        teamId={teamId}
        routes={r}
        writeReason={writeReason}
        serviceAdmin={me.serviceAdmin}
        spend={byRoute}
      />
      <TeamEndpoints teamId={teamId} routes={r} writeReason={writeReason} spend={byRoute} />
    </div>
  );
}
