// The route tables of a team (screens 60, 61, 66): service endpoints the team uses, those it may add, and its own.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { TeamEndpointRecord } from "../../../application/ports/modelEndpoints.js";
import type { TeamRoutes } from "../../../application/usecases/modelEndpoints/ModelEndpointsUseCases.js";
import {
  credentialView,
  healthView,
  locationWord,
  offReasonText,
  optInBlock,
  pricingWord,
  putTeamModelEndpointCredentialCli,
  putTeamModelEndpointsCli,
  selectedByWord,
} from "../../../domain/modelEndpoints.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  Modal,
  SecretInput,
  type SecretInputHandle,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { useSecretMutation } from "../../hooks/useSecretMutation.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { AREA, ErrorAlert, RouteBadges, teamRoutesKey, usd } from "../sg-model-endpoints/shared.js";

/** The team's routes as the API groups them. */
export function useTeamRoutes(teamId: string) {
  const uc = useService("teamModelEndpoints");
  return useQuery({
    queryKey: teamRoutesKey(teamId),
    queryFn: ({ signal }) => uc.routes(teamId, signal),
  });
}

const health = (e: TeamEndpointRecord) =>
  healthView(e.health?.state, e.providerState === "off" || e.offReason === "provider_disabled");
const needsKey = (e: TeamEndpointRecord) =>
  e.credentialState !== "not_required" &&
  e.credentialMode !== "shared" &&
  e.federationState !== "pending" &&
  e.federationState !== "ready" &&
  e.federationState !== "failing";

/** Service endpoints the team has added, and those it may add (screens 60, 61). */
export function ServiceRoutes({
  teamId,
  routes,
  writeReason,
  serviceAdmin,
  spend,
}: {
  teamId: string;
  routes: TeamRoutes | undefined;
  /** Why the caller may not change the team's routes, or undefined when they may. */
  writeReason: string | undefined;
  serviceAdmin: boolean;
  spend?: ReadonlyMap<string, string> | undefined;
}) {
  const uc = useService("teamModelEndpoints");
  const qc = useQueryClient();
  const [removing, setRemoving] = useState<TeamEndpointRecord | undefined>();
  const [keyFor, setKeyFor] = useState<TeamEndpointRecord | undefined>();
  const done = () => void qc.invalidateQueries({ queryKey: areaKey(AREA) });
  const add = useMutation({
    mutationFn: (id: string) => uc.add(teamId, routes?.selected ?? [], id),
    onSettled: done,
  });
  const remove = useMutation({
    mutationFn: (id: string) => uc.remove(teamId, routes?.selected ?? [], id),
    onSettled: () => {
      setRemoving(undefined);
      done();
    },
  });
  const selected = routes?.selected ?? [];
  const available = routes?.available ?? [];
  const status = routes ? "ready" : "loading";
  return (
    <>
      <ErrorAlert errors={[add.error, remove.error]} title="The team's routes were not changed" />
      <Card title={`Service endpoints (${selected.length})`}>
        <p>
          Endpoints switched on by service admins that this team opted in to. Endpoints with extra
          terms need a service admin.
        </p>
        <Table
          id="team-service-routes"
          caption="Service endpoints of the team"
          status={status}
          emptyText="The team uses no service endpoint."
          columns={[
            {
              id: "route",
              header: "Route",
              alwaysVisible: true,
              text: (e) => e.slug,
              cell: (e) => (
                <>
                  <code>{e.slug}</code>
                  <div>{e.displayName}</div>
                </>
              ),
            },
            { id: "location", header: "Location", cell: (e) => locationWord(e.location) },
            {
              id: "budget",
              header: "Budget control",
              text: (e) => e.pricingMode,
              cell: (e) => <RouteBadges e={e} />,
            },
            {
              id: "credential",
              header: "Credential",
              text: (e) => credentialView(e.credentialState).word,
              cell: (e) => <StatusIndicator view={credentialView(e.credentialState)} />,
            },
            {
              id: "health",
              header: "Health",
              text: (e) => offReasonText(e.offReason) ?? health(e).word,
              cell: (e) =>
                e.offReason ? (
                  <StatusIndicator view={{ word: offReasonText(e.offReason) ?? "", dot: "red" }} />
                ) : (
                  <StatusIndicator view={health(e)} />
                ),
            },
            { id: "by", header: "Selected by", cell: (e) => selectedByWord(e.selectedBy) },
            { id: "spend", header: "Spend MTD", cell: (e) => usd(spend?.get(e.slug)) },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (e) => (
                <>
                  {needsKey(e) && (
                    <>
                      <Button
                        aria-label={`Set credential for ${e.slug}`}
                        disabledReason={writeReason}
                        onClick={() => setKeyFor(e)}
                      >
                        {e.credentialState === "set" ? "Replace key" : "Set key"}
                      </Button>{" "}
                    </>
                  )}
                  {e.slug !== "bedrock" && (
                    <Button
                      aria-label={`Remove ${e.slug} from team`}
                      disabled={remove.isPending}
                      disabledReason={writeReason ?? optInBlock(e, serviceAdmin)}
                      onClick={() => setRemoving(e)}
                    >
                      Remove from team
                    </Button>
                  )}
                </>
              ),
            },
          ]}
          items={selected}
          getRowId={(e) => e.id}
        />
      </Card>
      <Card title={`Available to add (${available.length})`}>
        <Table
          id="team-available-routes"
          caption="Service endpoints the team may add"
          status={status}
          emptyText="Every switched-on service endpoint is already added."
          columns={[
            {
              id: "route",
              header: "Route",
              alwaysVisible: true,
              text: (e) => e.slug,
              cell: (e) => (
                <>
                  <code>{e.slug}</code>
                  <div>{e.displayName}</div>
                </>
              ),
            },
            { id: "location", header: "Location", cell: (e) => locationWord(e.location) },
            { id: "pricing", header: "Pricing", cell: (e) => pricingWord(e.pricingMode) },
            {
              id: "budget",
              header: "Budget control",
              text: (e) => e.pricingMode,
              cell: (e) => <RouteBadges e={e} />,
            },
            {
              id: "add",
              header: "Actions",
              alwaysVisible: true,
              cell: (e) => (
                <Button
                  aria-label={`Add ${e.slug} to team`}
                  disabled={add.isPending}
                  disabledReason={writeReason ?? optInBlock(e, serviceAdmin)}
                  onClick={() => add.mutate(e.id)}
                >
                  Add service endpoint
                </Button>
              ),
            },
          ]}
          items={available}
          getRowId={(e) => e.id}
        />
        <CliPreview
          command={putTeamModelEndpointsCli(
            teamId,
            selected.map((e) => e.id),
          )}
        />
      </Card>
      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.slug} from the team`}
          confirmLabel="Remove"
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => remove.mutate(removing.id)}
        >
          Agents of this team stop reaching {removing.slug} within 60 s. Agents with it as their
          default route lose that default.
        </ConfirmDialog>
      )}
      {keyFor && <TeamKeyDialog teamId={teamId} e={keyFor} onClose={() => setKeyFor(undefined)} />}
    </>
  );
}

/** The team's own endpoints (screens 61, 66). */
export function TeamEndpoints({
  teamId,
  routes,
  writeReason,
  spend,
}: {
  teamId: string;
  routes: TeamRoutes | undefined;
  writeReason: string | undefined;
  spend?: ReadonlyMap<string, string> | undefined;
}) {
  const uc = useService("teamModelEndpoints");
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<TeamEndpointRecord | undefined>();
  const [keyFor, setKeyFor] = useState<TeamEndpointRecord | undefined>();
  const del = useMutation({
    mutationFn: (e: TeamEndpointRecord) => uc.delete(teamId, e),
    onSettled: () => {
      setDeleting(undefined);
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
    },
  });
  const own = routes?.own ?? [];
  return (
    <>
      <ErrorAlert errors={[del.error]} title="The endpoint was not deleted" />
      <Card title={`Team endpoints (${own.length})`}>
        <p>Declared by this team. Owner and purpose are shown to service admins.</p>
        <Table
          id="team-own-endpoints"
          caption="Team endpoints"
          status={routes ? "ready" : "loading"}
          emptyText="This team has declared no endpoint."
          columns={[
            {
              id: "route",
              header: "Route",
              alwaysVisible: true,
              cell: (e) => <code>{e.slug}</code>,
            },
            {
              id: "address",
              header: "Address",
              cell: (e) => <code>{e.baseUrl ?? "—"}</code>,
            },
            { id: "location", header: "Location", cell: (e) => locationWord(e.location) },
            { id: "pricing", header: "Pricing", cell: (e) => pricingWord(e.pricingMode) },
            {
              id: "budget",
              header: "Budget control",
              text: (e) => e.pricingMode,
              cell: (e) => <RouteBadges e={e} />,
            },
            {
              id: "health",
              header: "Health",
              text: (e) => health(e).word,
              cell: (e) => <StatusIndicator view={health(e)} />,
            },
            { id: "owner", header: "Owner", cell: (e) => e.owner ?? "—" },
            { id: "spend", header: "Spend MTD", cell: (e) => usd(spend?.get(e.slug)) },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (e) => (
                <>
                  {e.credentialState !== "not_required" && (
                    <>
                      <Button
                        aria-label={`Set credential for ${e.slug}`}
                        disabledReason={writeReason}
                        onClick={() => setKeyFor(e)}
                      >
                        {e.credentialState === "set" ? "Replace key" : "Set key"}
                      </Button>{" "}
                    </>
                  )}
                  <Button
                    aria-label={`Delete ${e.slug}`}
                    disabledReason={writeReason}
                    onClick={() => setDeleting(e)}
                  >
                    Delete
                  </Button>
                </>
              ),
            },
          ]}
          items={own}
          getRowId={(e) => e.id}
        />
      </Card>
      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.slug}`}
          confirmLabel="Delete"
          onCancel={() => setDeleting(undefined)}
          onConfirm={() => del.mutate(deleting)}
        >
          Agents of this team stop reaching {deleting.slug} within 60 s. Its usage history stays in
          the reports.
        </ConfirmDialog>
      )}
      {keyFor && <TeamKeyDialog teamId={teamId} e={keyFor} onClose={() => setKeyFor(undefined)} />}
    </>
  );
}

/** The team's key for one route; the value lives only in the masked input (TC-UI-06). */
function TeamKeyDialog({
  teamId,
  e,
  onClose,
}: {
  teamId: string;
  e: TeamEndpointRecord;
  onClose: () => void;
}) {
  const uc = useService("teamModelEndpoints");
  const qc = useQueryClient();
  const value = useRef<SecretInputHandle>(null);
  const put = useSecretMutation((v: { value: string }) => uc.setCredential(teamId, e.id, v.value));
  const err = isAppError(put.error) ? put.error : undefined;
  const close = () => {
    value.current?.clear();
    onClose();
  };
  return (
    <Modal
      title={`Set key · ${e.slug}`}
      onClose={close}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={put.pending}
            onClick={async () => {
              const r = await put.run({ value: value.current?.read() ?? "" });
              if (r) {
                void qc.invalidateQueries({ queryKey: areaKey(AREA) });
                onClose();
              }
            }}
          >
            Save key
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && (
        <ErrorAlert errors={[err]} title="The key was not saved" />
      )}
      <Alert kind="info" title="Write-only">
        The key is kept by the team gateway. It is never shown again and never reaches an agent.
      </Alert>
      <FormField label="API key" error={err?.fields.value}>
        <SecretInput ref={value} />
      </FormField>
      <CliPreview command={putTeamModelEndpointCredentialCli(teamId, e.id)} />
    </Modal>
  );
}
