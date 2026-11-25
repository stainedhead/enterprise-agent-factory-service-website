import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type {
  EndpointRecord,
  EndpointTeamRecord,
} from "../../../application/ports/modelEndpoints.js";
import {
  authWord,
  BEDROCK_ROUTE,
  createEndpointModelPriceCli,
  credentialView,
  federationView,
  healthView,
  locationWord,
  pricingWord,
  protocolWords,
  putEndpointFederationCli,
  putModelEndpointCredentialCli,
  routeBaseUrlEnv,
  serviceStateView,
} from "../../../domain/modelEndpoints.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  KeyValue,
  Modal,
  PageHeader,
  SecretInput,
  type SecretInputHandle,
  StatusIndicator,
  Switch,
  Table,
  Tabs,
  TextInput,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { useSecretMutation } from "../../hooks/useSecretMutation.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { AREA, ErrorAlert, endpointKey, endpointTeamsKey, RouteBadges, usd } from "./shared.js";

/** SG3 (screen 58, MEG-WEB-2, -5): an endpoint's details, models and prices, teams, credentials and federation. */
export function EndpointDetailPage() {
  const { endpointId = "" } = useParams();
  const uc = useService("adminModelEndpoints");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reason = gate(me, "admin:model-endpoints");
  const detail = useQuery({
    queryKey: endpointKey(endpointId),
    queryFn: ({ signal }) => uc.detail(endpointId, signal),
  });
  const [confirm, setConfirm] = useState<"switch" | "delete" | undefined>();
  const refresh = () => void qc.invalidateQueries({ queryKey: areaKey(AREA) });
  const toggle = useMutation({
    mutationFn: (e: EndpointRecord) => uc.setEnabled(e, !e.enabled),
    onSettled: () => {
      setConfirm(undefined);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (e: EndpointRecord) => uc.delete(e),
    onSuccess: () => {
      refresh();
      navigate("/model-endpoints");
    },
    onError: () => setConfirm(undefined),
  });
  const e = detail.data;
  const builtin = e?.slug === BEDROCK_ROUTE;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Model endpoints", to: "/model-endpoints" },
          { label: e?.slug ?? endpointId },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title={e?.slug ?? endpointId}
        {...(e && { badge: <StatusIndicator view={serviceStateView(e)} /> })}
        {...(e && { description: e.displayName })}
        infoHref="/docs/model-endpoints"
        actions={
          e && (
            <>
              {!builtin && e.providerState !== "off" && (
                <Switch
                  label="On for teams"
                  checked={e.enabled}
                  disabledReason={reason}
                  busy={toggle.isPending}
                  onChange={() => setConfirm("switch")}
                  showLabel
                />
              )}{" "}
              <Button
                disabledReason={
                  reason ??
                  (builtin
                    ? "The built-in Bedrock route cannot be deleted"
                    : e.enabled
                      ? "Turn the endpoint off first"
                      : undefined)
                }
                onClick={() => setConfirm("delete")}
              >
                Delete
              </Button>
            </>
          )
        }
      />
      <ErrorAlert errors={[detail.error, toggle.error, remove.error]} />
      {e && (
        <Tabs
          label={`${e.slug} details`}
          tabs={[
            { id: "details", label: "Details", content: <Details e={e} /> },
            { id: "teams", label: "Teams & credentials", content: <TeamsTab e={e} /> },
          ]}
        />
      )}
      {e && confirm === "switch" && (
        <ConfirmDialog
          title={`Turn ${e.enabled ? "off" : "on"} ${e.slug}`}
          confirmLabel={e.enabled ? "Turn off" : "Turn on"}
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => toggle.mutate(e)}
        >
          {e.enabled
            ? `Calls through ${e.slug} are refused for every team within 60 s. Nothing is deleted.`
            : `${e.slug} is offered to every team; each team opts in.`}
        </ConfirmDialog>
      )}
      {e && confirm === "delete" && (
        <ConfirmDialog
          title={`Delete ${e.slug}`}
          confirmLabel="Delete"
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => remove.mutate(e)}
        >
          The endpoint, its prices and its team selections are deleted. Its usage history stays in
          the reports.
        </ConfirmDialog>
      )}
    </div>
  );
}

function Details({ e }: { e: EndpointRecord }) {
  const me = useMe();
  const pricing = gate(me, "admin:pricing");
  const [pricingModel, setPricingModel] = useState<string | undefined>();
  return (
    <>
      <Card title="Endpoint">
        <KeyValue
          items={[
            { label: "Route", value: <code>{e.slug}</code> },
            { label: "Agents see", value: <code>{routeBaseUrlEnv(e.slug)}</code> },
            { label: "Provider", value: e.provider },
            { label: "Location", value: locationWord(e.location) },
            { label: "Base URL", value: <code>{e.baseUrl}</code> },
            { label: "Protocols", value: protocolWords(e.protocols) },
            { label: "Authentication", value: authWord(e.authKind) },
            { label: "Credential", value: e.credentialMode === "shared" ? "Shared" : "Per team" },
            { label: "Pricing", value: pricingWord(e.pricingMode) },
            { label: "Budget control", value: <RouteBadges e={e} /> },
            {
              label: "Health (15 min)",
              value: (
                <StatusIndicator view={healthView(e.health?.state, e.providerState === "off")} />
              ),
            },
            ...(e.teamId ? [{ label: "Declared by team", value: e.teamId }] : []),
            ...(e.owner ? [{ label: "Owner", value: e.owner }] : []),
            ...(e.purpose ? [{ label: "Purpose", value: e.purpose }] : []),
          ]}
        />
      </Card>
      <Card title={`Models (${e.models?.length ?? 0})`}>
        <Table
          id="admin-endpoint-models"
          caption={`Models of ${e.slug}`}
          emptyText="No models."
          columns={[
            {
              id: "model",
              header: "Model",
              alwaysVisible: true,
              cell: (m) => <code>{m.modelName}</code>,
            },
            { id: "max", header: "Max output tokens", cell: (m) => m.maxOutputTokens },
            {
              id: "callable",
              header: "Callable",
              text: (m) => (m.callable === false ? "Not callable" : "Callable"),
              cell: (m) => (
                <StatusIndicator
                  view={
                    m.callable === false
                      ? { word: "Not callable", dot: "red" }
                      : { word: "Callable", dot: "green" }
                  }
                />
              ),
            },
            { id: "price", header: "Price", cell: (m) => m.priceState ?? "—" },
            {
              id: "in",
              header: "Input $/MTok",
              cell: (m) => m.price?.inputUsdPerMtok ?? "—",
            },
            {
              id: "out",
              header: "Output $/MTok",
              cell: (m) => m.price?.outputUsdPerMtok ?? "—",
            },
            ...(e.pricingMode === "per_token"
              ? [
                  {
                    id: "actions",
                    header: "Actions",
                    alwaysVisible: true,
                    cell: (m: { modelName: string }) => (
                      <Button
                        aria-label={`Add price for ${m.modelName}`}
                        disabledReason={pricing}
                        onClick={() => setPricingModel(m.modelName)}
                      >
                        Add price
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          items={e.models ?? []}
          getRowId={(m) => m.modelName}
        />
      </Card>
      {pricingModel && (
        <PriceDialog e={e} modelName={pricingModel} onClose={() => setPricingModel(undefined)} />
      )}
    </>
  );
}

function PriceDialog({
  e,
  modelName,
  onClose,
}: {
  e: EndpointRecord;
  modelName: string;
  onClose: () => void;
}) {
  const uc = useService("adminModelEndpoints");
  const qc = useQueryClient();
  const [v, setV] = useState({
    inputUsdPerMtok: "",
    outputUsdPerMtok: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  });
  const effectiveFrom = `${v.effectiveFrom}T00:00:00Z`;
  const add = useMutation({
    mutationFn: () => uc.addPrice(e.id, { modelName, ...v, effectiveFrom }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      onClose();
    },
  });
  const ok =
    /^\d+(\.\d{1,6})?$/.test(v.inputUsdPerMtok) && /^\d+(\.\d{1,6})?$/.test(v.outputUsdPerMtok);
  return (
    <Modal
      title={`Add price · ${e.slug}/${modelName}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={add.isPending}
            disabledReason={ok ? undefined : "Enter both prices, for example 2.50"}
            onClick={() => add.mutate()}
          >
            Add price
          </Button>
        </>
      }
    >
      <ErrorAlert errors={[add.error]} title="The price was not added" />
      <FormField label="Input $/MTok">
        <TextInput
          inputMode="decimal"
          value={v.inputUsdPerMtok}
          onChange={(x) => setV({ ...v, inputUsdPerMtok: x.target.value })}
        />
      </FormField>
      <FormField label="Output $/MTok">
        <TextInput
          inputMode="decimal"
          value={v.outputUsdPerMtok}
          onChange={(x) => setV({ ...v, outputUsdPerMtok: x.target.value })}
        />
      </FormField>
      <FormField label="Effective from (UTC)">
        <TextInput
          type="date"
          value={v.effectiveFrom}
          onChange={(x) => setV({ ...v, effectiveFrom: x.target.value })}
        />
      </FormField>
      <CliPreview command={createEndpointModelPriceCli(e.id, { modelName, ...v, effectiveFrom })} />
    </Modal>
  );
}

function TeamsTab({ e }: { e: EndpointRecord }) {
  const uc = useService("adminModelEndpoints");
  const me = useMe();
  const reason = gate(me, "admin:model-endpoints");
  const teams = useQuery({
    queryKey: endpointTeamsKey(e.id),
    queryFn: ({ signal }) => uc.teams(e.id, signal),
  });
  const [credential, setCredential] = useState<
    { scope: string; label: string; rotate: boolean } | undefined
  >();
  const [federation, setFederation] = useState<EndpointTeamRecord | undefined>();
  const federated = e.authKind.endsWith("_federated");
  const needsKey = e.authKind !== "none" && !federated && e.slug !== BEDROCK_ROUTE;
  return (
    <>
      <ErrorAlert errors={[teams.error]} />
      {needsKey && e.credentialMode === "shared" && (
        <Card title="Shared credential">
          <p>One service key for every team. The value is write-only and never shown.</p>
          <Button
            disabledReason={reason}
            onClick={() => setCredential({ scope: "shared", label: "shared", rotate: false })}
          >
            Set credential
          </Button>{" "}
          <Button
            disabledReason={reason}
            onClick={() => setCredential({ scope: "shared", label: "shared", rotate: true })}
          >
            Rotate
          </Button>
        </Card>
      )}
      <Card title={`Teams (${teams.data?.length ?? 0})`}>
        <Table
          id="admin-endpoint-teams"
          caption={`Teams of ${e.slug}`}
          status={teams.isPending ? "loading" : teams.isError ? "error" : "ready"}
          emptyText="No team has selected this endpoint."
          columns={[
            {
              id: "team",
              header: "Team",
              alwaysVisible: true,
              cell: (t) => (
                <Link to={`/teams/${t.teamId}/admin?tab=model-endpoints`}>
                  {t.teamSlug ?? t.teamId}
                </Link>
              ),
            },
            {
              id: "selected",
              header: "Selected",
              cell: (t) => (t.selected ? "Yes" : "No"),
            },
            {
              id: "credential",
              header: "Credential",
              text: (t) => credentialView(t.credentialState).word,
              cell: (t) => <StatusIndicator view={credentialView(t.credentialState)} />,
            },
            {
              id: "federation",
              header: "Federation",
              text: (t) => federationView(t.federationState).word,
              cell: (t) => <StatusIndicator view={federationView(t.federationState)} />,
            },
            {
              id: "gateway",
              header: "Gateway",
              cell: (t) =>
                `${t.gatewayDeployment === "per_namespace" ? "Team gateway" : "Shared"}${t.gatewayVersion ? ` · ${t.gatewayVersion}` : ""}`,
            },
            { id: "spend", header: "Spend MTD", cell: (t) => usd(t.spendMtdUsd) },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (t) =>
                federated ? (
                  <Button
                    aria-label={`Federation for ${t.teamSlug ?? t.teamId}`}
                    disabledReason={reason}
                    onClick={() => setFederation(t)}
                  >
                    Federation
                  </Button>
                ) : needsKey && e.credentialMode === "per_team" ? (
                  <Button
                    aria-label={`${t.credentialState === "set" ? "Rotate" : "Set"} credential for ${t.teamSlug ?? t.teamId}`}
                    disabledReason={reason}
                    onClick={() =>
                      setCredential({
                        scope: t.teamId,
                        label: t.teamSlug ?? t.teamId,
                        rotate: t.credentialState === "set",
                      })
                    }
                  >
                    {t.credentialState === "set" ? "Rotate" : "Set credential"}
                  </Button>
                ) : (
                  "—"
                ),
            },
          ]}
          items={teams.data ?? []}
          getRowId={(t) => t.teamId}
        />
      </Card>
      {credential && (
        <CredentialDialog
          endpoint={e}
          scope={credential.scope}
          label={credential.label}
          rotate={credential.rotate}
          onClose={() => setCredential(undefined)}
        />
      )}
      {federation && (
        <FederationDialog endpoint={e} team={federation} onClose={() => setFederation(undefined)} />
      )}
    </>
  );
}

/** The credential value lives only in the masked input until it is sent (TC-UI-06). */
function CredentialDialog({
  endpoint,
  scope,
  label,
  rotate,
  onClose,
}: {
  endpoint: EndpointRecord;
  scope: string;
  label: string;
  rotate: boolean;
  onClose: () => void;
}) {
  const uc = useService("adminModelEndpoints");
  const qc = useQueryClient();
  const value = useRef<SecretInputHandle>(null);
  const put = useSecretMutation((v: { value: string }) =>
    rotate
      ? uc.rotateCredential(endpoint.id, scope, v.value)
      : uc.setCredential(endpoint.id, scope, v.value),
  );
  const err = isAppError(put.error) ? put.error : undefined;
  const close = () => {
    value.current?.clear();
    onClose();
  };
  return (
    <Modal
      title={`${rotate ? "Rotate" : "Set"} credential · ${endpoint.slug} · ${label}`}
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
            {rotate ? "Rotate" : "Set credential"}
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && (
        <ErrorAlert errors={[err]} title="The credential was not saved" />
      )}
      <Alert kind="info" title="Write-only">
        The value goes to the team gateway's secret store. It is never shown again and never reaches
        an agent.
      </Alert>
      <FormField label="Credential value" error={err?.fields.value}>
        <SecretInput ref={value} />
      </FormField>
      <CliPreview command={putModelEndpointCredentialCli(endpoint.id, scope)} />
    </Modal>
  );
}

const FEDERATION_FIELDS = [
  { key: "expectedIssuer", label: "Expected issuer" },
  { key: "expectedSubject", label: "Expected subject" },
  { key: "expectedAudience", label: "Expected audience" },
  { key: "expectedRoleArn", label: "Role to assume (optional)" },
] as const;

/** Federation metadata the cloud admins set up for one team (PRD §11.1); no secret is entered here. */
function FederationDialog({
  endpoint,
  team,
  onClose,
}: {
  endpoint: EndpointRecord;
  team: EndpointTeamRecord;
  onClose: () => void;
}) {
  const uc = useService("adminModelEndpoints");
  const qc = useQueryClient();
  const [v, setV] = useState<Record<string, string>>({});
  const put = useMutation({
    mutationFn: () => uc.putFederation(endpoint.id, team.teamId, v),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      onClose();
    },
  });
  return (
    <Modal
      title={`Federation · ${endpoint.slug} · ${team.teamSlug ?? team.teamId}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={put.isPending} onClick={() => put.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <p>
        Status: <StatusIndicator view={federationView(team.federationState)} />
      </p>
      <ErrorAlert errors={[put.error]} title="Federation was not saved" />
      {FEDERATION_FIELDS.map((f) => (
        <FormField key={f.key} label={f.label}>
          <TextInput
            value={v[f.key] ?? ""}
            onChange={(x) => setV({ ...v, [f.key]: x.target.value })}
          />
        </FormField>
      ))}
      <CliPreview command={putEndpointFederationCli(endpoint.id, team.teamId, v)} />
    </Modal>
  );
}
