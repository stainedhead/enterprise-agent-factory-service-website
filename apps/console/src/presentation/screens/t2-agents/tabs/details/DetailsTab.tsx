import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import { isTemplateRetired } from "../../../../../application/usecases/agents/AgentsUseCases.js";
import { agentView } from "../../../../../domain/status.js";
import { formatLocal } from "../../../../../domain/time.js";
import {
  Alert,
  Badge,
  Button,
  GenerationNote,
  KeyValue,
  StatusIndicator,
} from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { ExpandVolumeDialog } from "../../dialogs.js";
import { agentsKey } from "../../keys.js";
import type { PanelTabProps } from "../../panelTabs.js";

const ON_DELETE: Record<string, string> = {
  snapshot_then_delete: "Snapshot, then delete volume",
  delete: "Delete volume",
  retain: "Retain volume",
};

/** *Details*: image, identity, resources, volume with *Expand*, snapshots and the status (WEB-US-25.2, 25.3). */
export function DetailsTab({ teamId, agent }: PanelTabProps) {
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
      {isTemplateRetired(agent) && (
        <Alert kind="warning" title="Template retired">
          The template <strong>{agent.template}</strong> has been retired. Edit the agent to choose
          a new template or image digest.
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
          {
            label: "Template",
            value: (
              <>
                {agent.template}{" "}
                {isTemplateRetired(agent) && <Badge tone="purple">Template retired</Badge>}
              </>
            ),
          },
          { label: "Model", value: agent.modelId },
          { label: "Image", value: <code>{agent.image}</code> },
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
