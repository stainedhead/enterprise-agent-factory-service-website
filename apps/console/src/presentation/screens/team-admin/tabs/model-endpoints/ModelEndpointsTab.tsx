import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { putTeamGatewaySettingsCli } from "../../../../../domain/modelEndpoints.js";
import {
  Button,
  Card,
  CliPreview,
  FormField,
  SelectInput,
  Switch,
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { areaKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";
import { AREA, ErrorAlert } from "../../../sg-model-endpoints/shared.js";
import {
  ServiceRoutes,
  TeamEndpoints,
  useTeamRoutes,
} from "../../../tg-model-endpoints/RouteTables.js";

/** SG5 (screen 60, MEG-WEB-2): a team's gateway settings and its routes, as a service admin sees them. */
export function ModelEndpointsTab({ teamId }: { teamId: string }) {
  const me = useMe();
  const routes = useTeamRoutes(teamId);
  // PutTeamGatewaySettings is `teams:set-guardrails`; the selection is `model-endpoints:write` (contract 1.5.0)
  const reason = gate(me, "teams:set-guardrails");
  const write = gate(me, "model-endpoints:write", teamId);
  const r = routes.data;
  return (
    <>
      <ErrorAlert errors={[routes.error]} />
      {r && (
        <GatewaySettings
          key={`${r.gatewayDeployment}-${r.mayAddModelEndpoints}`}
          teamId={teamId}
          current={{
            deployment: r.gatewayDeployment,
            mayAddModelEndpoints: r.mayAddModelEndpoints,
          }}
          reason={reason}
        />
      )}
      <ServiceRoutes
        teamId={teamId}
        routes={r}
        writeReason={write}
        serviceAdmin={me.serviceAdmin}
      />
      <TeamEndpoints teamId={teamId} routes={r} writeReason={write} />
    </>
  );
}

function GatewaySettings({
  teamId,
  current,
  reason,
}: {
  teamId: string;
  current: { deployment: string; mayAddModelEndpoints: boolean };
  reason: string | undefined;
}) {
  const uc = useService("adminModelEndpoints");
  const qc = useQueryClient();
  const [v, setV] = useState(current);
  // the Team resource does not report the MCP members (contract note 11): they are sent only when changed here,
  // and the saved values come back in the response
  const [mcp, setMcp] = useState<{ mayAddMcpServers?: boolean; mcpPlacement?: string }>({});
  const save = useMutation({
    mutationFn: () => uc.putGatewaySettings(teamId, undefined, { ...v, ...mcp }),
    onSuccess: () => {
      setMcp({});
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
    },
  });
  const saved = save.data;
  const changed =
    v.deployment !== current.deployment ||
    v.mayAddModelEndpoints !== current.mayAddModelEndpoints ||
    Object.keys(mcp).length > 0;
  const mayAddMcp = mcp.mayAddMcpServers ?? saved?.mayAddMcpServers ?? false;
  const placement = mcp.mcpPlacement ?? saved?.mcpPlacement ?? "";
  return (
    <Card title="Team gateway">
      <ErrorAlert errors={[save.error]} title="The gateway settings were not saved" />
      <FormField
        label="Deployment"
        hint="A team gateway runs in the team's namespace; a team with its own endpoints or MCP servers needs one."
      >
        <SelectInput
          value={v.deployment}
          aria-disabled={reason !== undefined || undefined}
          options={[
            { value: "shared", label: "Shared gateway" },
            { value: "per_namespace", label: "Team gateway in the team's namespace" },
          ]}
          onChange={(e) => reason === undefined && setV({ ...v, deployment: e.target.value })}
        />
      </FormField>
      <p>
        <Switch
          label="The team may declare its own model endpoints"
          checked={v.mayAddModelEndpoints}
          disabledReason={reason}
          onChange={(on) => setV({ ...v, mayAddModelEndpoints: on })}
          showLabel
        />
      </p>
      <fieldset style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 700 }}>MCP servers</legend>
        <p>
          <Switch
            label="Team-admins may register team MCP servers"
            checked={mayAddMcp}
            disabledReason={reason}
            onChange={(on) => setMcp({ ...mcp, mayAddMcpServers: on })}
            showLabel
          />
        </p>
        <FormField
          label="MCP placement"
          hint="With the model routes in one gateway Deployment, or in its own. Empty keeps the stored value (service default gateway.mcp.placement_default)."
        >
          <SelectInput
            value={placement}
            placeholder="Keep the stored placement"
            aria-disabled={reason !== undefined || undefined}
            options={[
              { value: "combined", label: "Combined with the model routes" },
              { value: "separate", label: "Separate gateway Deployment" },
            ]}
            onChange={(e) => {
              if (reason !== undefined) return;
              const { mcpPlacement: _drop, ...rest } = mcp;
              setMcp(e.target.value ? { ...rest, mcpPlacement: e.target.value } : rest);
            }}
          />
        </FormField>
        {saved && (
          <p role="status">
            Saved: team MCP servers {saved.mayAddMcpServers ? "allowed" : "not allowed"}
            {saved.mcpPlacement ? `, placement ${saved.mcpPlacement}` : ""}.
          </p>
        )}
      </fieldset>
      <Button
        variant="primary"
        disabled={save.isPending}
        disabledReason={reason ?? (changed ? undefined : "Nothing changed")}
        onClick={() => save.mutate()}
      >
        Save gateway settings
      </Button>
      <CliPreview command={putTeamGatewaySettingsCli(teamId, { ...v, ...mcp })} />
    </Card>
  );
}
