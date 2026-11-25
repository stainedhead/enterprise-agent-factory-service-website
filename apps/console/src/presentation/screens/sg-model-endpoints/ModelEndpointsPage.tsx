import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import type { EndpointRecord } from "../../../application/ports/modelEndpoints.js";
import type { EndpointProposalRow } from "../../../application/usecases/modelEndpoints/ModelEndpointsUseCases.js";
import {
  BEDROCK_ROUTE,
  healthView,
  locationWord,
  pricingWord,
  protocolWords,
  serviceStateView,
  updateModelEndpointEnabledCli,
} from "../../../domain/modelEndpoints.js";
import { MODEL_ENDPOINT_TABS, type ModelEndpointTab } from "../../../domain/navigation.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  LinkButton,
  PageHeader,
  StatusIndicator,
  Switch,
  Table,
  Tabs,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { ProviderPolicy } from "./ProviderPolicy.js";
import { AREA, catalogKey, ErrorAlert, proposalsKey, RouteBadges } from "./shared.js";

const rate = (v: string | undefined) => v ?? "—";
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** The tab a path names (`/model-endpoints`, `/proposals`, `/providers`). */
export function tabOfPath(pathname: string): ModelEndpointTab {
  if (pathname.endsWith("/proposals")) return "proposals";
  if (pathname.endsWith("/providers")) return "providers";
  return "endpoints";
}

/** SG1 (screen 56, MEG-WEB-1): service endpoints, team-declared endpoints, price proposals and provider policy. */
export function ModelEndpointsPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const active = tabOfPath(pathname);
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Model endpoints" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Model endpoints"
        description="OpenAI-compatible model services agents reach through their team gateway, by route name. Every call through a route is metered; per-token routes count against team budgets and hard caps."
        infoHref="/docs/model-endpoints"
        actions={
          <LinkButton
            variant="primary"
            href="/model-endpoints/new"
            disabledReason={gate(me, "admin:model-endpoints")}
          >
            Create endpoint
          </LinkButton>
        }
      />
      <Tabs
        label="Model endpoints"
        activeId={active}
        onChange={(id) => {
          const t = MODEL_ENDPOINT_TABS.find((x) => x.id === id);
          if (t) navigate(t.path, { replace: true });
        }}
        tabs={[
          { id: "endpoints", label: "Endpoints", content: <EndpointsTab /> },
          { id: "proposals", label: "Price proposals", content: <ProposalsTab /> },
          { id: "providers", label: "Provider policy", content: <ProviderPolicy /> },
        ]}
      />
    </div>
  );
}

function EndpointsTab() {
  const uc = useService("adminModelEndpoints");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:model-endpoints");
  const catalog = useQuery({ queryKey: catalogKey, queryFn: ({ signal }) => uc.catalog(signal) });
  const [switching, setSwitching] = useState<EndpointRecord | undefined>();
  const toggle = useMutation({
    mutationFn: (e: EndpointRecord) => uc.setEnabled(e, !e.enabled),
    onSettled: () => {
      setSwitching(undefined);
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
    },
  });
  const service = catalog.data?.service ?? [];
  const team = catalog.data?.team ?? [];
  const degraded = service.filter((e) => e.health?.state === "Degraded");
  const status = catalog.isPending ? "loading" : catalog.isError ? "error" : "ready";
  return (
    <>
      <ErrorAlert errors={[catalog.error, toggle.error]} />
      {degraded.map((e) => (
        <Alert key={e.id} kind="warning" title={`${e.slug} is degraded`}>
          {e.health?.reason ?? "Calls still flow; teams were notified."}{" "}
          <Link to={`/reports/inference?route=${e.slug}`}>Open inference report</Link>
        </Alert>
      ))}
      <Card title={`Service endpoints (${service.length})`}>
        <p>
          Switched-on endpoints are offered to every team; each team opts in. Endpoints with extra
          terms are selected per team by a service admin. Off means off for every team.
        </p>
        <Table
          id="admin-model-endpoints"
          caption="Service endpoints"
          filterLabel="Find endpoints"
          status={status}
          emptyText="No endpoints."
          propertyFilters={[
            {
              id: "location",
              label: "Location",
              options: ["external", "corporate"].map((v) => ({ value: v, label: locationWord(v) })),
              match: (e, v) => e.location === v,
            },
            {
              id: "pricing",
              label: "Pricing mode",
              options: ["per_token", "capacity", "free"].map((v) => ({
                value: v,
                label: pricingWord(v),
              })),
              match: (e, v) => e.pricingMode === v,
            },
          ]}
          columns={[
            {
              id: "route",
              header: "Route",
              alwaysVisible: true,
              sortValue: (e) => e.slug,
              text: (e) => e.slug,
              cell: (e) => (
                <>
                  <Link to={`/model-endpoints/${e.id}`}>
                    <code>{e.slug}</code>
                  </Link>
                  <div>{e.displayName}</div>
                </>
              ),
            },
            { id: "protocol", header: "Protocol", cell: (e) => protocolWords(e.protocols) },
            { id: "location", header: "Location", cell: (e) => locationWord(e.location) },
            { id: "pricing", header: "Pricing", cell: (e) => pricingWord(e.pricingMode) },
            {
              id: "budget",
              header: "Budget control",
              text: (e) => e.pricingMode,
              cell: (e) => <RouteBadges e={e} />,
            },
            {
              id: "service",
              header: "Service",
              alwaysVisible: true,
              text: (e) => serviceStateView(e).word,
              cell: (e) =>
                e.slug === BEDROCK_ROUTE || e.providerState === "off" ? (
                  <StatusIndicator view={serviceStateView(e)} />
                ) : (
                  <Switch
                    label={`${e.slug} on for teams`}
                    checked={e.enabled}
                    busy={toggle.isPending}
                    disabledReason={reason}
                    onChange={() => setSwitching(e)}
                    showLabel={false}
                  />
                ),
            },
            { id: "teams", header: "Teams", cell: (e) => e.teamsSelected ?? 0 },
            {
              id: "health",
              header: "Health (15 min)",
              text: (e) => healthView(e.health?.state, e.providerState === "off").word,
              cell: (e) => (
                <StatusIndicator view={healthView(e.health?.state, e.providerState === "off")} />
              ),
            },
            {
              id: "credential",
              header: "Credential",
              cell: (e) =>
                e.slug === BEDROCK_ROUTE
                  ? "Gateway role"
                  : e.authKind === "none"
                    ? "None"
                    : e.authKind.endsWith("_federated")
                      ? "Workload identity (per team)"
                      : e.credentialMode === "shared"
                        ? "Shared key"
                        : "Per team",
            },
          ]}
          items={service}
          getRowId={(e) => e.id}
        />
      </Card>
      <Card title={`Team-declared endpoints (${team.length})`}>
        <p>
          Declared by teams you allow to add endpoints. Read here; manage the permission on each
          team's <em>Model endpoints</em> tab.
        </p>
        <Table
          id="admin-team-endpoints"
          caption="Team-declared endpoints"
          status={status}
          emptyText="No team has declared an endpoint."
          columns={[
            {
              id: "route",
              header: "Route",
              alwaysVisible: true,
              cell: (e) => (
                <Link to={`/model-endpoints/${e.id}`}>
                  <code>{e.slug}</code>
                </Link>
              ),
            },
            {
              id: "team",
              header: "Team",
              cell: (e) => (
                <Link to={`/teams/${e.teamId}/admin?tab=model-endpoints`}>{e.teamId}</Link>
              ),
            },
            { id: "location", header: "Location", cell: (e) => locationWord(e.location) },
            { id: "pricing", header: "Pricing", cell: (e) => pricingWord(e.pricingMode) },
            { id: "owner", header: "Owner", cell: (e) => e.owner ?? "—" },
            { id: "purpose", header: "Purpose", cell: (e) => e.purpose ?? "—" },
            {
              id: "health",
              header: "Health",
              cell: (e) => <StatusIndicator view={healthView(e.health?.state)} />,
            },
          ]}
          items={team}
          getRowId={(e) => e.id}
        />
      </Card>
      {switching && (
        <ConfirmDialog
          title={`Turn ${switching.enabled ? "off" : "on"} ${switching.slug}`}
          confirmLabel={switching.enabled ? "Turn off" : "Turn on"}
          onCancel={() => setSwitching(undefined)}
          onConfirm={() => toggle.mutate(switching)}
        >
          <p>
            {switching.enabled
              ? `Calls through ${switching.slug} are refused for every team within 60 s. Agents that use it keep their other routes. Nothing is deleted.`
              : `${switching.slug} is offered to every team again; each team opts in.`}
          </p>
          <CliPreview command={updateModelEndpointEnabledCli(switching.id, !switching.enabled)} />
        </ConfirmDialog>
      )}
    </>
  );
}

function ProposalsTab() {
  const uc = useService("adminModelEndpoints");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:pricing");
  const pending = useQuery({
    queryKey: proposalsKey,
    queryFn: ({ signal }) => uc.pendingProposals(signal),
  });
  const [deciding, setDeciding] = useState<
    { row: EndpointProposalRow; decision: "approve" | "reject" } | undefined
  >();
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject"; note?: string | undefined }) =>
      uc.decide(v.id, v.decision, v.note),
    onSettled: () => {
      setDeciding(undefined);
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
    },
  });
  const rows = pending.data ?? [];
  return (
    <>
      <ErrorAlert errors={[pending.error, decide.error]} />
      <Card title={`Price changes waiting for approval (${rows.length})`}>
        <p>
          Read from provider price lists and statements. An approved price applies from its
          effective date, or from approval if that is later. Budgets reserve spend at the approved
          price.
        </p>
        <Table
          id="admin-endpoint-price-proposals"
          caption="Pending endpoint price proposals"
          status={pending.isPending ? "loading" : pending.isError ? "error" : "ready"}
          emptyText="No price changes are waiting."
          columns={[
            {
              id: "route",
              header: "Route",
              alwaysVisible: true,
              cell: (r) => <code>{r.slug}</code>,
            },
            { id: "model", header: "Model", cell: (r) => <code>{r.proposal.modelName}</code> },
            { id: "eff", header: "Effective from", cell: (r) => utc(r.proposal.effectiveFrom) },
            {
              id: "in",
              header: "Input $/MTok",
              cell: (r) => `${rate(r.old?.inputUsdPerMtok)} → ${r.proposal.inputUsdPerMtok}`,
            },
            {
              id: "out",
              header: "Output $/MTok",
              cell: (r) => `${rate(r.old?.outputUsdPerMtok)} → ${r.proposal.outputUsdPerMtok}`,
            },
            { id: "source", header: "Source", cell: (r) => r.proposal.source ?? "—" },
            {
              id: "fetched",
              header: "Fetched",
              cell: (r) => (
                <time dateTime={r.proposal.fetchedAt} title={utcTitle(r.proposal.fetchedAt)}>
                  {formatLocal(r.proposal.fetchedAt)}
                </time>
              ),
            },
            {
              id: "decision",
              header: "Decision",
              alwaysVisible: true,
              cell: (r) => (
                <>
                  <Button
                    aria-label={`Reject ${r.slug} ${r.proposal.modelName}`}
                    disabledReason={reason}
                    onClick={() => setDeciding({ row: r, decision: "reject" })}
                  >
                    Reject
                  </Button>{" "}
                  <Button
                    variant="primary"
                    aria-label={`Approve ${r.slug} ${r.proposal.modelName}`}
                    disabledReason={reason}
                    onClick={() => setDeciding({ row: r, decision: "approve" })}
                  >
                    Approve
                  </Button>
                </>
              ),
            },
          ]}
          items={rows}
          getRowId={(r) => r.proposal.id}
        />
      </Card>
      {deciding && (
        <ConfirmDialog
          title={`${deciding.decision === "approve" ? "Approve" : "Reject"} price change`}
          confirmLabel={deciding.decision === "approve" ? "Approve" : "Reject"}
          withNote={{ label: "Note (optional)" }}
          onCancel={() => setDeciding(undefined)}
          onConfirm={(note) =>
            decide.mutate({ id: deciding.row.proposal.id, decision: deciding.decision, note })
          }
        >
          {deciding.decision === "approve"
            ? `The new prices for ${deciding.row.slug}/${deciding.row.proposal.modelName} apply from ${utc(deciding.row.proposal.effectiveFrom)}, or from approval if that is later.`
            : `The proposed prices for ${deciding.row.slug}/${deciding.row.proposal.modelName} are discarded; the current prices stay.`}
        </ConfirmDialog>
      )}
    </>
  );
}
