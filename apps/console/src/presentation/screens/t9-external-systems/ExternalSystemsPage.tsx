import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { ExternalSystemRecord } from "../../../application/ports/externalSystems.js";
import { switchState } from "../../../application/usecases/externalSystems/ExternalSystemsUseCases.js";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  Table,
} from "../../components/index.js";
import { teamKey, useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { SystemDialog } from "./SystemDialogs.js";
import { SystemSwitch } from "./SystemSwitch.js";

export const teamSystemsKey = (teamId: string) =>
  queryKey({ area: "externalSystems", teamId, resource: "team" });

/**
 * T9 (WEB-US-32.1, 32.2): the systems agents of this team may reach. A system off at a higher level is
 * shown off and locked; *Declare system* is enabled only when the platform lets this team declare its own.
 */
export function ExternalSystemsPage() {
  const { teamId = "" } = useParams();
  const systems = useService("externalSystems");
  const teams = useService("teams");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("external-systems:write");
  const [dialog, setDialog] = useState<
    | { kind: "edit"; s?: ExternalSystemRecord }
    | { kind: "delete"; s: ExternalSystemRecord }
    | undefined
  >();
  const list = useQuery({
    queryKey: teamSystemsKey(teamId),
    queryFn: ({ signal }) => systems.listTeam(teamId, signal),
  });
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: teamSystemsKey(teamId) });
  const toggle = useMutation({
    mutationFn: (v: { s: ExternalSystemRecord; on: boolean }) =>
      systems.setTeamState(teamId, { id: v.s.id, version: v.s.version }, v.on),
    onSettled: () => void refresh(),
  });
  const del = useMutation({
    mutationFn: (s: ExternalSystemRecord) =>
      systems.deleteTeam(teamId, { id: s.id, version: s.version }),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = [toggle.error, del.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);
  const mayDeclare = team.data?.mayAddExternalSystems === true;
  const declareReason =
    reason ?? (mayDeclare ? undefined : "Requires a platform admin to allow this team to declare");

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "External systems" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="External systems"
        description="The services this team's agents may reach. A system switched off here is off for every agent of the team."
        infoHref="/docs/external-systems"
        actions={
          <Button
            variant="primary"
            disabledReason={declareReason}
            onClick={() => setDialog({ kind: "edit" })}
          >
            Declare system
          </Button>
        }
      />
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The change was not applied" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Card>
        <Table
          id="team-external-systems"
          caption="External systems"
          filterLabel="Find systems"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="No external systems are available to this team."
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (s) => s.name,
              text: (s) => s.name,
              cell: (s) => (
                <>
                  {s.name} {s.unmetered && <Badge tone="teal">Unmetered</Badge>}{" "}
                  {s.scope === "team" && <Badge tone="blue">Team-declared</Badge>}
                </>
              ),
            },
            {
              id: "category",
              header: "Category",
              sortValue: (s) => s.category,
              cell: (s) => s.category,
            },
            { id: "endpoints", header: "Endpoints", cell: (s) => s.endpoints.join(", ") },
            {
              id: "access",
              header: "Access",
              text: (s) => (switchState(s, "team").on ? "On" : "Off"),
              cell: (s) => (
                <SystemSwitch
                  name={s.name}
                  state={switchState(s, "team")}
                  reason={reason}
                  busy={toggle.isPending}
                  onChange={(on) => toggle.mutate({ s, on })}
                />
              ),
            },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (s) =>
                s.scope === "team" ? (
                  <>
                    <Button
                      aria-label={`Edit ${s.name}`}
                      disabledReason={reason}
                      onClick={() => setDialog({ kind: "edit", s })}
                    >
                      Edit
                    </Button>{" "}
                    <Button
                      aria-label={`Delete ${s.name}`}
                      disabledReason={reason}
                      onClick={() => setDialog({ kind: "delete", s })}
                    >
                      Delete
                    </Button>
                  </>
                ) : (
                  "—"
                ),
            },
          ]}
          items={list.data ?? []}
          getRowId={(s) => s.id}
        />
      </Card>
      {dialog?.kind === "edit" && (
        <SystemDialog
          teamId={teamId}
          existing={dialog.s}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.s.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => del.mutate(dialog.s)}
        >
          Agents of this team can no longer reach {dialog.s.name}.
        </ConfirmDialog>
      )}
    </div>
  );
}
