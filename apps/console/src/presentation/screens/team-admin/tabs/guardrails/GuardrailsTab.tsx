import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import { buildCli } from "../../../../../domain/cli.js";
import { label } from "../../../../../domain/labels.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  SelectInput,
} from "../../../../components/index.js";
import { teamKey, useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { useService } from "../../../../services.js";

type Change =
  | { field: "isolationTier"; value: "shared" | "dedicated" }
  | { field: "viewerKubectl"; value: boolean };

const WORDS: Record<Change["field"], string> = {
  isolationTier: "isolation tier",
  viewerKubectl: "viewer kubectl",
};

/**
 * *Guardrails* (WEB-US-23): the isolation tier (`shared` or `dedicated`) and the viewer kubectl switch. Only
 * service admins hold `teams:set-guardrails`; everyone else sees the controls disabled with the role needed, and
 * the API's `403` is shown as access denied. Each change confirms and shows the equivalent CLI command.
 */
export function GuardrailsTab({ teamId }: { teamId: string }) {
  const teams = useService("teams");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("teams:set-guardrails");
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const [tier, setTier] = useState<string | undefined>();
  const [pending, setPending] = useState<Change | undefined>();
  const save = useMutation({
    mutationFn: (c: Change) =>
      teams.update(
        { id: teamId, version: team.data?.version ?? 0 },
        c.field === "isolationTier" ? { isolationTier: c.value } : { viewerKubectl: c.value },
      ),
    onSettled: () => {
      setPending(undefined);
      setTier(undefined);
      void qc.invalidateQueries({ queryKey: teamKey(teamId) });
    },
  });
  const t = team.data;
  if (!t) return <p role="status">Loading…</p>;
  const err = isAppError(save.error) ? save.error : undefined;
  const chosen = tier ?? t.isolationTier;
  return (
    <Card title="Guardrails">
      <p>
        Set by service admins only. The isolation tier decides whether the team's workloads share
        nodes with other teams; viewer kubectl lets viewers download a read-only kubeconfig for the
        namespace.
      </p>
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The change was not applied"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField label="Isolation tier" hint={`Now ${label("isolationTier", t.isolationTier)}`}>
        <SelectInput
          value={chosen}
          disabled={reason !== undefined}
          onChange={(e) => setTier(e.target.value)}
          options={[
            { value: "shared", label: "Shared" },
            { value: "dedicated", label: "Dedicated" },
          ]}
        />
      </FormField>
      <p>
        <Button
          disabledReason={reason ?? (chosen === t.isolationTier ? "No change to apply" : undefined)}
          onClick={() =>
            setPending({ field: "isolationTier", value: chosen as "shared" | "dedicated" })
          }
        >
          Apply isolation tier
        </Button>
      </p>
      <p>
        Viewer kubectl is <strong>{t.viewerKubectl ? "on" : "off"}</strong>.{" "}
        <Button
          disabledReason={reason}
          onClick={() => setPending({ field: "viewerKubectl", value: !t.viewerKubectl })}
        >
          {t.viewerKubectl ? "Turn off viewer kubectl" : "Turn on viewer kubectl"}
        </Button>
      </p>
      {reason && <p>{reason}: guardrails are set by service admins.</p>}
      {pending && (
        <ConfirmDialog
          title={`Change ${WORDS[pending.field]}`}
          confirmLabel="Apply"
          onCancel={() => setPending(undefined)}
          onConfirm={() => save.mutate(pending)}
        >
          <p>
            {pending.field === "isolationTier"
              ? `Set the isolation tier to ${pending.value}. The reconciler moves the team's workloads accordingly.`
              : pending.value
                ? "Viewers of this team can download a read-only kubeconfig."
                : "Viewers can no longer download a kubeconfig."}
          </p>
          <CliPreview
            command={buildCli("UpdateTeam", {
              teamId,
              [pending.field === "isolationTier" ? "isolationTier" : "viewerKubectl"]:
                pending.value,
            })}
          />
        </ConfirmDialog>
      )}
    </Card>
  );
}
