import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ExportRecord } from "../../../application/ports/adminExports.js";
import {
  downloadState,
  isRunning,
} from "../../../application/usecases/adminExports/AdminExportsUseCases.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import { Alert, Button, Card, StatusIndicator, Table } from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";

const VIEW = {
  pending: { word: "Pending", dot: "grey" },
  running: { word: "Running", dot: "blue" },
  succeeded: { word: "Complete", dot: "green" },
  failed: { word: "Failed", dot: "red" },
} as const;

const view = (s: string) => VIEW[s as keyof typeof VIEW] ?? ({ word: s, dot: "grey" } as const);

const size = (b: number | undefined) =>
  b === undefined
    ? "—"
    : b < 1024
      ? `${b} B`
      : b < 1048576
        ? `${(b / 1024).toFixed(1)} KB`
        : `${(b / 1048576).toFixed(1)} MB`;

/**
 * *Create export* (`202`, then polled until it completes) and the past exports with size, checksum and the
 * download link, valid 7 days and then shown expired (D49).
 */
export function ExportsCard() {
  const exports = useService("adminExports");
  const teams = useOptionalService("teams");
  const qc = useQueryClient();
  const key = queryKey({ area: "admin-exports", resource: "list" });
  const list = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => exports.list(signal),
    refetchInterval: (q) => ((q.state.data ?? []).some(isRunning) ? 2000 : false),
  });
  const teamList = useQuery({
    queryKey: queryKey({ area: "admin-exports", resource: "teams" }),
    queryFn: ({ signal }) =>
      teams ? teams.listRows({ maxResults: 100, signal }) : Promise.reject(new Error("no teams")),
    enabled: teams !== undefined,
    retry: false,
  });
  const [chosen, setChosen] = useState<readonly string[]>([]);
  const create = useMutation({
    mutationFn: () => exports.create(chosen),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const err = isAppError(create.error) ? create.error : undefined;
  const now = Date.now();

  return (
    <Card title="Exports">
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The export was not started"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <fieldset style={{ border: 0, padding: 0, margin: "0 0 12px" }}>
        <legend>Teams to export (none selected exports every team)</legend>
        {(teamList.data?.rows ?? []).map((r) => (
          <label key={r.team.id} style={{ marginRight: 16 }}>
            <input
              type="checkbox"
              checked={chosen.includes(r.team.id)}
              onChange={(e) =>
                setChosen(
                  e.target.checked ? [...chosen, r.team.id] : chosen.filter((x) => x !== r.team.id),
                )
              }
            />{" "}
            {r.team.displayName}
          </label>
        ))}
      </fieldset>
      <div style={{ marginBottom: 12 }}>
        <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate()}>
          Create export
        </Button>
      </div>
      <Table
        id="admin-exports"
        caption="Exports"
        filterLabel="Find exports"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="No exports yet."
        columns={[
          {
            id: "created",
            header: "Created",
            alwaysVisible: true,
            sortValue: (e: ExportRecord) => e.createdAt,
            text: (e) => e.createdAt,
            cell: (e) => (
              <time dateTime={e.createdAt} title={utcTitle(e.createdAt)}>
                {formatLocal(e.createdAt)}
              </time>
            ),
          },
          {
            id: "teams",
            header: "Teams",
            text: (e) => (e.teamIds.length === 0 ? "All teams" : e.teamIds.join(" ")),
            cell: (e) => (e.teamIds.length === 0 ? "All teams" : `${e.teamIds.length} selected`),
          },
          {
            id: "status",
            header: "Status",
            text: (e) => view(e.status).word,
            cell: (e) => (
              <>
                <StatusIndicator view={view(e.status)} />
                {isRunning(e) && <span role="status"> Preparing the bundle…</span>}
                {e.status === "failed" && e.error && <div role="alert">{e.error}</div>}
              </>
            ),
          },
          {
            id: "size",
            header: "Size",
            text: (e) => size(e.sizeBytes),
            cell: (e) => size(e.sizeBytes),
          },
          {
            id: "sha",
            header: "SHA-256",
            text: (e) => e.sha256 ?? "",
            cell: (e) => (e.sha256 ? <code>{e.sha256}</code> : "—"),
          },
          {
            id: "download",
            header: "Download",
            alwaysVisible: true,
            cell: (e) => {
              const s = downloadState(e, now);
              if (s === "ready")
                return (
                  <a href={e.downloadUrl} download aria-label={`Download export ${e.id}`}>
                    Download
                  </a>
                );
              // "expired" also covers a succeeded export without a usable link (the adapter drops a non-https
              // `downloadUrl`, FR-020): that is a dash, not a claim that the 7 days have passed.
              if (s === "expired")
                return e.downloadExpiresAt && Date.parse(e.downloadExpiresAt) <= now ? (
                  <span>Expired</span>
                ) : (
                  "—"
                );
              return "—";
            },
          },
        ]}
        items={list.data ?? []}
        getRowId={(e) => e.id}
      />
    </Card>
  );
}
