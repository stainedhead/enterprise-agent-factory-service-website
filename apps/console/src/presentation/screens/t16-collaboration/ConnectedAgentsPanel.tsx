import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { CollaborationRecord, LinkRecord } from "../../../application/ports/collaboration.js";
import type { BulkResult } from "../../../application/usecases/collaboration/CollaborationUseCases.js";
import { linkStateView } from "../../../domain/collaboration.js";
import { connectAgentCli, disconnectAgentCli } from "../../../domain/collaborationCli.js";
import {
  Alert,
  Button,
  CliPreview,
  ConfirmDialog,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { linksKey, workersKey } from "./keys.js";

/** The worker agents and their Paperclip links, with bulk connect and disconnect (WEB-US-46). */
export function ConnectedAgentsPanel({
  teamId,
  record,
  manageReason,
}: {
  teamId: string;
  record: CollaborationRecord;
  manageReason: string | undefined;
}) {
  const collab = useService("collaboration");
  const agents = useService("agents");
  const qc = useQueryClient();
  const links = usePolledQuery({
    queryKey: linksKey(teamId),
    queryFn: ({ signal }) => collab.listLinks(teamId, { maxResults: 100 }, signal),
    phasesOf: (p) => p.items.map((l) => (l.linkState === "pending" ? "Reconciling" : "Ready")),
  });
  const workers = useQuery({
    queryKey: workersKey(teamId),
    queryFn: ({ signal }) => agents.workers(teamId, signal),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [asking, setAsking] = useState<"connect" | "disconnect" | undefined>();
  const [results, setResults] = useState<BulkResult[]>([]);
  const byAgent = new Map<string, LinkRecord>((links.data?.items ?? []).map((l) => [l.agentId, l]));
  const rows = (workers.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    link: byAgent.get(a.id),
  }));
  const run = useMutation({
    mutationFn: async (kind: "connect" | "disconnect") => {
      const picked = rows.filter((r) => selected.includes(r.id));
      return collab.bulk(teamId, kind, picked);
    },
    onSuccess: (r) => {
      setResults(r);
      setAsking(undefined);
      setSelected([]);
      void qc.invalidateQueries({ queryKey: linksKey(teamId) });
    },
  });
  const failed = results.filter((r) => !r.ok);
  const first = rows.find((r) => r.id === selected[0]);
  const blocked = manageReason ?? (selected.length === 0 ? "Select one or more agents" : undefined);
  return (
    <section aria-label="Connected agents">
      <h2>Connected agents</h2>
      <p>Registration is {record.registrationMode}. Connected workers appear in Paperclip.</p>
      <Button disabledReason={blocked} onClick={() => setAsking("connect")}>
        Connect
      </Button>{" "}
      <Button disabledReason={blocked} onClick={() => setAsking("disconnect")}>
        Disconnect
      </Button>
      {failed.length > 0 && (
        <Alert kind="warning" title={`${failed.length} of ${results.length} did not complete`}>
          <ul>
            {failed.map((f) => (
              <li key={f.agentId}>
                {f.agentName}: {f.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {results.length > 0 && failed.length === 0 && (
        <Alert kind="success" title={`${results.length} agents updated`} />
      )}
      <Table
        id="collab-links"
        caption="Worker agents"
        filterLabel="Find agents"
        status={
          workers.isPending || links.isPending ? "loading" : workers.isError ? "error" : "ready"
        }
        error={isAppError(workers.error) ? workers.error.message : undefined}
        emptyText="This team has no worker agents."
        selection={{ mode: "multi", selected, onChange: setSelected }}
        columns={[
          {
            id: "name",
            header: "Agent",
            alwaysVisible: true,
            sortValue: (r) => r.name,
            cell: (r) => r.name,
          },
          {
            id: "state",
            header: "Paperclip",
            sortValue: (r) => r.link?.linkState ?? "",
            text: (r) => linkStateView(r.link?.linkState ?? "disabled").word,
            cell: (r) => (
              <StatusIndicator
                view={
                  r.link?.connect
                    ? linkStateView(r.link.linkState)
                    : { word: "Not connected", dot: "grey" }
                }
              />
            ),
          },
          { id: "synced", header: "Last synced", cell: (r) => r.link?.lastSyncedAt ?? "—" },
          { id: "err", header: "Last error", cell: (r) => r.link?.lastError ?? "" },
        ]}
        items={rows}
        getRowId={(r) => r.id}
      />
      {asking && first && (
        <ConfirmDialog
          title={`${asking === "connect" ? "Connect" : "Disconnect"} ${selected.length} ${selected.length === 1 ? "agent" : "agents"}`}
          confirmLabel={asking === "connect" ? "Connect" : "Disconnect"}
          onCancel={() => setAsking(undefined)}
          onConfirm={() => run.mutate(asking)}
        >
          Each agent is changed in turn. A failure does not undo the others.
          <CliPreview
            command={
              asking === "connect"
                ? connectAgentCli(teamId, first.id)
                : disconnectAgentCli(teamId, first.id)
            }
          />
        </ConfirmDialog>
      )}
    </section>
  );
}
