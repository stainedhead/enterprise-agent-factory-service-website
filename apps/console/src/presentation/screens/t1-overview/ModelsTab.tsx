import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import { Alert, Button, Card, WidgetBoundary } from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

/** *Models* tab (`/t/:teamId?tab=models`; the nav has no route of its own): the team's enabled models; only service admins edit (WEB-US-24.2). */
export function ModelsTab({ teamId, version }: { teamId: string; version: number }) {
  const me = useMe();
  const teams = useService("teams");
  const qc = useQueryClient();
  const key = queryKey({ area: "teams", teamId, resource: "models" });
  const models = useQuery({ queryKey: key, queryFn: ({ signal }) => teams.models(teamId, signal) });
  const catalog = useQuery({
    queryKey: queryKey({ area: "teams", resource: "catalog-models" }),
    queryFn: ({ signal }) => teams.catalogModels(signal),
    enabled: false,
  });
  const [editing, setEditing] = useState<string[] | undefined>();
  const save = useMutation({
    mutationFn: (ids: string[]) => teams.putModels({ id: teamId, version }, ids),
    onSuccess: () => {
      setEditing(undefined);
      void qc.invalidateQueries({ queryKey: key });
    },
  });
  const denied = gate(me, "teams:set-guardrails");
  const err = save.error;

  const edit = async () => {
    const all = await catalog.refetch();
    void all;
    setEditing((models.data ?? []).map((m) => m.id));
  };
  const options = catalog.data ?? models.data ?? [];

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
          <fieldset>
            <legend>Models enabled for this team</legend>
            {options.map((m) => (
              <label key={m.id} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={editing.includes(m.id)}
                  onChange={(e) =>
                    setEditing(
                      e.target.checked ? [...editing, m.id] : editing.filter((x) => x !== m.id),
                    )
                  }
                />{" "}
                {m.displayName}
              </label>
            ))}
          </fieldset>
        ) : models.data && models.data.length > 0 ? (
          <ul>
            {models.data.map((m) => (
              <li key={m.id}>
                {m.displayName} <span style={{ color: "var(--muted)" }}>({m.provider})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>{models.isPending ? "Loading…" : "No models are enabled for this team."}</p>
        )}
      </WidgetBoundary>
    </Card>
  );
}
