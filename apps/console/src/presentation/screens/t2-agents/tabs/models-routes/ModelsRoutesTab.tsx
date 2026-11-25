import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import { routesSpecOf } from "../../../../../application/usecases/modelEndpoints/ModelEndpointsUseCases.js";
import {
  type AgentRoutesSpec,
  type RouteChoice,
  renderEnv,
  routeEnvPreview,
  toRoutesBody,
  updateAgentRoutesCli,
  validateRoutes,
} from "../../../../../domain/modelEndpoints.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  FormField,
  KeyValue,
  SelectInput,
  Table,
} from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { areaKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { ErrorAlert, RouteBadges } from "../../../sg-model-endpoints/shared.js";
import { useTeamRoutes } from "../../../tg-model-endpoints/RouteTables.js";
import { agentsKey } from "../../keys.js";
import type { PanelTabProps } from "../../panelTabs.js";

/**
 * TG3 and VG2 (screens 63, 67; MEG-WEB-4): the agent's Bedrock models (unchanged from 1.1.0) and its routes, the
 * default route and model, and the environment it receives on its next restart.
 */
export function ModelsRoutesTab({ teamId, agent }: PanelTabProps) {
  const uc = useService("agentRoutes");
  const qc = useQueryClient();
  const routes = useTeamRoutes(teamId);
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("agents:write");
  const initial = routesSpecOf(agent);
  const [spec, setSpec] = useState<AgentRoutesSpec>(initial);
  const r = routes.data;
  const usable = r ? [...r.selected, ...r.own].filter((e) => e.enabled && !e.offReason) : [];
  const team: RouteChoice[] = usable.map((e) => ({
    slug: e.slug,
    protocols: e.protocols,
    models: e.models.map((m) => m.modelName),
  }));
  const errors = validateRoutes(spec, team);
  const save = useMutation({
    mutationFn: () => uc.save(teamId, agent, spec, team),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentsKey(teamId) });
      void qc.invalidateQueries({ queryKey: areaKey("agents", teamId) });
    },
  });
  const apiErr = isAppError(save.error) ? save.error : undefined;
  const stale = apiErr?.kind === "stale";
  const slugs = team.map((t) => t.slug);
  const env = routeEnvPreview(spec, slugs, {
    gatewayUrl: agent.models.env?.AFS_GATEWAY_URL,
    ownOpenAiBaseUrl: false,
  });
  const agentRoutes =
    spec.routeAccess === "all" ? slugs : spec.routes.filter((s) => slugs.includes(s));
  const defaultModels = team.find((t) => t.slug === spec.defaultRoute)?.models ?? [];
  const changed = JSON.stringify(spec) !== JSON.stringify(initial);
  const m = agent.models;
  return (
    <>
      <Card title="Bedrock models">
        <KeyValue
          items={[
            {
              label: "Access",
              value: m.access === "all" ? "All team models" : m.modelIds.join(", ") || "None",
            },
            { label: "Default model", value: <code>{m.defaultModelId}</code> },
          ]}
        />
      </Card>
      <Card title="Routes">
        <p>
          From the routes this team may use ({slugs.length}). The agent may call only these, through
          the team gateway.
        </p>
        <ErrorAlert errors={[routes.error]} />
        <div role="radiogroup" aria-label="Route access">
          {(["all", "selected"] as const).map((a) => (
            <label key={a} style={{ marginRight: 12 }}>
              <input
                type="radio"
                name={`route-access-${agent.id}`}
                checked={spec.routeAccess === a}
                aria-disabled={reason !== undefined || undefined}
                onChange={() =>
                  reason === undefined &&
                  setSpec({
                    ...spec,
                    routeAccess: a,
                    routes: a === "selected" && spec.routes.length === 0 ? [...slugs] : spec.routes,
                  })
                }
              />{" "}
              {a === "all" ? "All team routes" : "Selected routes"}
            </label>
          ))}
        </div>
        {errors.routes && <div role="alert">{errors.routes}</div>}
        <Table
          id="agent-routes"
          caption={`Routes of ${agent.name}`}
          status={routes.isPending ? "loading" : routes.isError ? "error" : "ready"}
          emptyText="The team has no route the agent can use."
          columns={[
            {
              id: "route",
              header: "Route",
              alwaysVisible: true,
              cell: (e) => <code>{e.slug}</code>,
            },
            {
              id: "selected",
              header: "Selected",
              alwaysVisible: true,
              cell: (e) => (
                <input
                  type="checkbox"
                  aria-label={`Agent may call ${e.slug}`}
                  checked={agentRoutes.includes(e.slug)}
                  aria-disabled={reason !== undefined || spec.routeAccess === "all" || undefined}
                  onChange={(x) => {
                    if (reason !== undefined || spec.routeAccess === "all") return;
                    setSpec({
                      ...spec,
                      routes: x.target.checked
                        ? [...spec.routes, e.slug]
                        : spec.routes.filter((s) => s !== e.slug),
                    });
                  }}
                />
              ),
            },
            {
              id: "models",
              header: "Models on route",
              cell: (e) => e.models.map((x) => x.modelName).join(", ") || "—",
            },
            {
              id: "budget",
              header: "Budget control",
              text: (e) => e.pricingMode,
              cell: (e) => <RouteBadges e={e} />,
            },
          ]}
          items={usable}
          getRowId={(e) => e.id}
        />
        <FormField label="Default route" error={errors.defaultRoute}>
          <SelectInput
            value={spec.defaultRoute}
            placeholder="No default route (Bedrock default model)"
            aria-disabled={reason !== undefined || undefined}
            options={agentRoutes.map((s) => ({ value: s, label: s }))}
            onChange={(e) =>
              reason === undefined &&
              setSpec({
                ...spec,
                defaultRoute: e.target.value,
                defaultModel: team.find((t) => t.slug === e.target.value)?.models[0] ?? "",
              })
            }
          />
        </FormField>
        {spec.defaultRoute && (
          <FormField label="Default model on that route" error={errors.defaultModel}>
            <SelectInput
              value={spec.defaultModel}
              aria-disabled={reason !== undefined || undefined}
              options={defaultModels.map((x) => ({ value: x, label: x }))}
              onChange={(e) =>
                reason === undefined && setSpec({ ...spec, defaultModel: e.target.value })
              }
            />
          </FormField>
        )}
      </Card>
      <Card title="What the agent receives">
        <p>Environment on the next restart. No upstream credential ever reaches the pod.</p>
        <section aria-label="Environment preview">
          <pre>
            <code>{renderEnv(env)}</code>
          </pre>
        </section>
      </Card>
      {stale && (
        <Alert kind="warning" title="The agent changed">
          Someone else changed this agent. Reload it and make your change again.
        </Alert>
      )}
      {apiErr && !stale && <ErrorAlert errors={[apiErr]} title="The routes were not saved" />}
      <Alert kind="info" title="Restart">
        Changing this agent's routes restarts its pod. Changes at team or service level apply at the
        gateway within 60 s and in the environment on the next restart.
      </Alert>
      <Button
        variant="primary"
        disabled={save.isPending}
        disabledReason={
          reason ??
          (!changed
            ? "Nothing changed"
            : Object.keys(errors).length > 0
              ? "Fix the routes first"
              : undefined)
        }
        onClick={() => save.mutate()}
      >
        Save routes
      </Button>
      <CliPreview command={updateAgentRoutesCli(teamId, agent.id, toRoutesBody(spec))} />
    </>
  );
}
