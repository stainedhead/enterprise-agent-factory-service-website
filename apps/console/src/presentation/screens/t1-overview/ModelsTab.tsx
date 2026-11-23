import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { TeamModelsRecord } from "../../../application/ports/teams.js";
import { type ModelAccess, priceView, putTeamModelsCli } from "../../../domain/modelAccess.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  StatusIndicator,
  WidgetBoundary,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

interface Draft {
  access: ModelAccess;
  modelIds: string[];
}

/**
 * *Models* tab (`/t/:teamId?tab=models`): the team's model access, All or Selected from the models the service has
 * enabled (MOD-2). Only service admins edit (`teams:set-guardrails`); a team-admin narrows per agent instead.
 */
export function ModelsTab({ teamId, version }: { teamId: string; version: number }) {
  const me = useMe();
  const teams = useService("teams");
  const qc = useQueryClient();
  const key = queryKey({ area: "teams", teamId, resource: "team-models" });
  const models = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => teams.teamModels(teamId, signal),
  });
  const catalog = useQuery({
    queryKey: queryKey({ area: "teams", resource: "catalog-models" }),
    queryFn: ({ signal }) => teams.catalogModels(signal),
    enabled: false,
  });
  const [editing, setEditing] = useState<Draft | undefined>();
  const save = useMutation({
    mutationFn: (d: Draft) =>
      teams.putTeamModels({ id: teamId, version }, { access: d.access, modelIds: d.modelIds }),
    onSuccess: () => {
      setEditing(undefined);
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({
        queryKey: queryKey({ area: "teams", teamId, resource: "models" }),
      });
    },
  });
  const denied = gate(me, "teams:set-guardrails");
  const err = save.error;
  const data: TeamModelsRecord | undefined = models.data;

  const edit = async () => {
    await catalog.refetch();
    setEditing({ access: data?.access ?? "all", modelIds: [...(data?.modelIds ?? [])] });
  };
  const options = catalog.data ?? data?.items ?? [];

  return (
    <Card
      title="Models"
      actions={
        editing ? (
          <>
            <Button onClick={() => setEditing(undefined)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={save.isPending}
              disabledReason={
                editing.access === "selected" && editing.modelIds.length === 0
                  ? "Choose at least one model"
                  : undefined
              }
              onClick={() => save.mutate(editing)}
            >
              Save models
            </Button>
          </>
        ) : (
          <Button disabledReason={denied} onClick={() => void edit()}>
            Edit models
          </Button>
        )
      }
    >
      <WidgetBoundary title="Models" error={models.error} onRetry={() => void models.refetch()}>
        {isAppError(err) && (
          <Alert kind="error" requestId={err.requestId}>
            {err.message}
          </Alert>
        )}
        {editing ? (
          <>
            <div role="radiogroup" aria-label="Team model access">
              {(["all", "selected"] as const).map((a) => (
                <label key={a} style={{ marginRight: 12 }}>
                  <input
                    type="radio"
                    name="team-model-access"
                    checked={editing.access === a}
                    onChange={() => setEditing({ ...editing, access: a })}
                  />{" "}
                  {a === "all" ? "All models the service enables" : "Selected models"}
                </label>
              ))}
            </div>
            {editing.access === "selected" && (
              <fieldset>
                <legend>Models enabled for this team</legend>
                {options.map((m) => (
                  <label key={m.id} style={{ display: "block" }}>
                    <input
                      type="checkbox"
                      checked={editing.modelIds.includes(m.id)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          modelIds: e.target.checked
                            ? [...editing.modelIds, m.id]
                            : editing.modelIds.filter((x) => x !== m.id),
                        })
                      }
                    />{" "}
                    {m.displayName}
                  </label>
                ))}
              </fieldset>
            )}
            <CliPreview command={putTeamModelsCli(teamId, editing)} />
          </>
        ) : data ? (
          <>
            <p>
              {data.access === "all"
                ? "All models the service enables."
                : `Selected models (${data.modelIds.length}).`}
            </p>
            {data.items.length > 0 ? (
              <ul>
                {data.items.map((m) => (
                  <li key={m.id}>
                    {m.displayName} <span style={{ color: "var(--muted)" }}>({m.provider})</span>{" "}
                    <StatusIndicator view={priceView(m.priceState)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p>No models are enabled for this team.</p>
            )}
          </>
        ) : (
          <p>{models.isPending ? "Loading…" : "No models are enabled for this team."}</p>
        )}
      </WidgetBoundary>
    </Card>
  );
}
