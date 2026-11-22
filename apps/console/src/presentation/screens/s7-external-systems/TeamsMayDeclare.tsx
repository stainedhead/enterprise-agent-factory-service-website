import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAppError } from "../../../application/errors.js";
import type { TeamRecord } from "../../../application/ports/teams.js";
import { Alert, Card, Table } from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

const key = queryKey({ area: "admin-externalSystems", resource: "declare-teams" });

/** Below the catalog: which teams may declare their own systems (WEB-US-18.4, guardrail `mayAddExternalSystems`). */
export function TeamsMayDeclare() {
  const teams = useService("teams");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "teams:set-guardrails");
  const list = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const out: TeamRecord[] = [];
      let nextToken: string | undefined;
      do {
        const p = await teams.listRows({
          maxResults: 100,
          signal,
          ...(nextToken && { nextToken }),
        });
        out.push(...p.rows.map((r) => r.team));
        nextToken = p.nextToken;
      } while (nextToken);
      return out;
    },
  });
  const set = useMutation({
    mutationFn: (v: { t: TeamRecord; on: boolean }) =>
      teams.update({ id: v.t.id, version: v.t.version }, { mayAddExternalSystems: v.on }),
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const err = isAppError(set.error) ? set.error : undefined;
  return (
    <Card title="Teams that may declare their own systems">
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The change was not applied" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Table
        id="teams-may-declare"
        caption="Teams that may declare their own systems"
        filterLabel="Find teams"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        emptyText="There are no teams."
        columns={[
          {
            id: "team",
            header: "Team",
            alwaysVisible: true,
            sortValue: (t) => t.displayName,
            cell: (t) => t.displayName,
          },
          {
            id: "may",
            header: "May declare systems",
            text: (t) => (t.mayAddExternalSystems ? "Yes" : "No"),
            cell: (t) => (
              <span title={reason}>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${t.displayName} may declare systems`}
                  aria-checked={t.mayAddExternalSystems}
                  checked={t.mayAddExternalSystems}
                  aria-disabled={reason !== undefined || set.isPending}
                  onChange={(e) => {
                    if (!reason && !set.isPending) set.mutate({ t, on: e.target.checked });
                  }}
                />{" "}
                {t.mayAddExternalSystems ? "Yes" : "No"}
              </span>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(t) => t.id}
      />
    </Card>
  );
}
