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
  const save = useMutation({
    mutationFn: () => uc.putGatewaySettings(teamId, undefined, v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: areaKey(AREA) }),
  });
  const changed =
    v.deployment !== current.deployment || v.mayAddModelEndpoints !== current.mayAddModelEndpoints;
  return (
    <Card title="Team gateway">
      <ErrorAlert errors={[save.error]} title="The gateway settings were not saved" />
      <FormField
        label="Deployment"
        hint="A team gateway runs in the team's namespace; a team with its own endpoints needs one."
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
      <Button
        variant="primary"
        disabled={save.isPending}
        disabledReason={reason ?? (changed ? undefined : "Nothing changed")}
        onClick={() => save.mutate()}
      >
        Save gateway settings
      </Button>
      <CliPreview command={putTeamGatewaySettingsCli(teamId, v)} />
    </Card>
  );
}
