import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import { isTemplateRetired } from "../../../application/usecases/agents/AgentsUseCases.js";
import { modelsColumn, modelsCountText } from "../../../domain/modelAccess.js";
import { RUNTIME_TEXT } from "../../../domain/orchestration.js";
import { agentView } from "../../../domain/status.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Badge,
  Button,
  GenerationNote,
  KeyValue,
  StatusIndicator,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { ExpandVolumeDialog } from "./dialogs.js";
import { agentsKey } from "./keys.js";
import type { PanelTabProps } from "./panelTabs.js";

const ON_DELETE: Record<string, string> = {
  snapshot_then_delete: "Snapshot, then delete volume",
  delete: "Delete volume",
  retain: "Retain volume",
};

/**
 * The agent's configuration (WEB-US-25.2, 25.3), shared by T2's *Details* tab and T18's *Agent configuration* tab
 * (ORC-22): runtime, models, resources, volume with *Expand*, snapshots and status. It never shows collaboration
 * settings (those live on the Orchestration page). The orchestration variant names the "Orchestration runtime" and
 * hides the template and image, which the API withholds from callers who are not service admins.
 */
export function AgentConfiguration({
  teamId,
  agent,
  variant = "worker",
}: PanelTabProps & { variant?: "worker" | "orchestration" }) {
  const orchestration = variant === "orchestration";
  const agents = useService("agents");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const [expand, setExpand] = useState(false);
  const snapKey = queryKey({ area: "agents", teamId, resource: "snapshots", id: agent.id });
  const snaps = useQuery({
    queryKey: snapKey,
    queryFn: ({ signal }) => agents.snapshots(teamId, agent.id, signal),
  });
  const grow = useMutation({
    mutationFn: (size: number) => agents.expandVolume(teamId, agent, size),
    onSuccess: () => {
      setExpand(false);
      void qc.invalidateQueries({ queryKey: agentsKey(teamId) });
    },
  });
  const v = agent.volume;
  const last = (snaps.data ?? [])
    .filter((s) => s.state !== "deleted")
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
  const view = agentView(agent);
  const reason = write.reasonFor("agents:write");
  const err = isAppError(grow.error) ? grow.error : undefined;

  return (
    <div>
      {!orchestration && isTemplateRetired(agent) && (
        <Alert kind="warning" title="Template retired">
          The template <strong>{agent.template ?? ""}</strong> has been retired. Edit the agent to
          choose a new template or image digest.
        </Alert>
      )}
      <KeyValue
        items={[
          {
            label: "Status",
            value: (
              <>
                <StatusIndicator view={view} />{" "}
                <GenerationNote
                  generation={agent.generation}
                  observed={agent.status.observedGeneration}
                />
              </>
            ),
          },
          ...(orchestration
            ? [{ label: "Runtime", value: RUNTIME_TEXT }]
            : [
                {
                  label: "Template",
                  value: (
                    <>
                      {agent.template ?? "—"}{" "}
                      {isTemplateRetired(agent) && <Badge tone="teal">Template retired</Badge>}
                    </>
                  ),
                },
              ]),
          {
            label: "Models",
            value: `${modelsColumn(agent.models)} · ${modelsCountText(agent.models, agent.models.effectiveModelIds?.length ?? agent.models.modelIds.length, "models")}`,
          },
          ...(agent.image !== null ? [{ label: "Image", value: <code>{agent.image}</code> }] : []),
          {
            label: "AWS identity",
            value: agent.iamIdentity === "dedicated" ? "Dedicated role" : "Team shared role",
          },
          { label: "Role ARN", value: agent.iamRoleArn ? <code>{agent.iamRoleArn}</code> : "—" },
          {
            label: "Resources",
            value: agent.resources
              ? `${agent.resources.cpu ?? "—"} vCPU · ${agent.resources.memory ?? "—"} · one pod`
              : "Template default · one pod",
          },
          {
            label: "Persistent volume",
            value: v ? (
              <>
                {v.sizeGiB ?? "—"} GiB {v.storageClass ?? ""}{" "}
                <Button variant="link" disabledReason={reason} onClick={() => setExpand(true)}>
                  Expand volume
                </Button>
              </>
            ) : (
              "—"
            ),
          },
          {
            label: "Snapshots",
            value: v?.snapshotSchedule
              ? `${v.snapshotSchedule === "off" ? "Off" : `${v.snapshotSchedule}, keep ${v.snapshotRetain ?? "—"}`}${
                  last ? ` · last ${formatLocal(last.requestedAt)} (${last.state})` : ""
                }`
              : "—",
          },
          { label: "On delete", value: ON_DELETE[v?.onDelete ?? ""] ?? v?.onDelete ?? "—" },
          {
            label: "Secrets",
            value: `${agent.secretBindings.length} ${agent.secretBindings.length === 1 ? "secret" : "secrets"}`,
          },
          { label: "Last change", value: agent.updatedAt ? formatLocal(agent.updatedAt) : "—" },
        ]}
      />
      {expand && (
        <ExpandVolumeDialog
          current={v?.sizeGiB ?? 0}
          pending={grow.isPending}
          error={err}
          onCancel={() => setExpand(false)}
          onSubmit={(n) => grow.mutate(n)}
        />
      )}
    </div>
  );
}
