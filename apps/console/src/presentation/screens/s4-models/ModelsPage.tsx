import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { ProposalRecord } from "../../../application/ports/adminModels.js";
import { serviceAccessOf } from "../../../application/usecases/settings/orchestrationSettings.js";
import {
  type ModelAccess,
  priceView,
  putServiceModelAccessCli,
} from "../../../domain/modelAccess.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  PageHeader,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey, queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

const catalogKey = queryKey({ area: "admin-models", resource: "catalog" });
const pendingKey = queryKey({ area: "admin-pricing", resource: "pending" });
const rate = (v: string | undefined) => v ?? "—";
const day = (iso: string) => iso.slice(0, 10);
const utc = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** S4 (WEB-US-15): models with effective-dated prices, proposals to approve or reject, and price history. */
export function ModelsPage() {
  const models = useService("adminModels");
  const pricing = useService("adminPricing");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:pricing");
  const modelsReason = gate(me, "admin:models");
  const settings = useOptionalService("settings");
  const settingsKey = queryKey({ area: "settings", resource: "settings" });
  const access = useQuery({
    queryKey: settingsKey,
    queryFn: ({ signal }) =>
      settings ? settings.list(signal) : Promise.reject(new Error("no settings service")),
    enabled: settings !== undefined,
    retry: false,
  });
  const current: ModelAccess | undefined = access.data ? serviceAccessOf(access.data) : undefined;
  const [draftAccess, setDraftAccess] = useState<ModelAccess | undefined>();
  const shownAccess = draftAccess ?? current ?? "all";
  const saveAccess = useMutation({
    mutationFn: (a: ModelAccess) => models.putServiceAccess(a),
    onSuccess: () => {
      setDraftAccess(undefined);
      void qc.invalidateQueries({ queryKey: settingsKey });
      void qc.invalidateQueries({ queryKey: areaKey("admin-models") });
    },
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; version: number | undefined; enabled: boolean }) =>
      models.setEnabled({ id: v.id, version: v.version }, v.enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: areaKey("admin-models") }),
  });
  const [selected, setSelected] = useState<string | undefined>();
  const [deciding, setDeciding] = useState<
    { p: ProposalRecord; decision: "approve" | "reject" } | undefined
  >();

  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => models.catalog(signal),
  });
  const pending = useQuery({
    queryKey: pendingKey,
    queryFn: ({ signal }) => pricing.pending(signal),
  });
  const history = useQuery({
    queryKey: queryKey({ area: "admin-models", resource: "history", id: selected }),
    queryFn: ({ signal }) => models.history(selected as string, signal),
    enabled: selected !== undefined,
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; decision: "approve" | "reject"; note?: string | undefined }) =>
      pricing.decide(v.id, v.decision, v.note),
    onSettled: () => {
      setDeciding(undefined);
      void qc.invalidateQueries({ queryKey: areaKey("admin-pricing") });
      void qc.invalidateQueries({ queryKey: areaKey("admin-models") });
    },
  });
  const err = [catalog.error, pending.error, decide.error, saveAccess.error, toggle.error]
    .map((e) => (isAppError(e) ? e : undefined))
    .find(Boolean);
  const rows = catalog.data ?? [];
  const sel = rows.find((r) => r.model.id === selected)?.model;

  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Model catalog & pricing" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Model catalog & pricing"
        description="Bedrock models teams may enable. Prices drive real-time spend reservation in the gateway; CUR reconciles daily."
        infoHref="/docs/models"
      />
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The request failed" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <Card title="Service model access">
        <p>
          Which models teams may use at all. Teams then narrow the list, and team-admins narrow it
          per agent. A model with no approved price cannot be called, even when it is enabled.
        </p>
        <div role="radiogroup" aria-label="Service model access">
          {(["all", "selected"] as const).map((a) => (
            <label key={a} style={{ marginRight: 12 }}>
              <input
                type="radio"
                name="service-model-access"
                checked={shownAccess === a}
                aria-disabled={modelsReason !== undefined || undefined}
                onChange={() => modelsReason === undefined && setDraftAccess(a)}
              />{" "}
              {a === "all" ? "All models" : "Selected models"}
            </label>
          ))}
        </div>
        {modelsReason && <p>{modelsReason}</p>}
        <Button
          variant="primary"
          disabled={saveAccess.isPending}
          disabledReason={
            modelsReason ??
            (draftAccess === undefined || draftAccess === current ? "Nothing changed" : undefined)
          }
          onClick={() => draftAccess && saveAccess.mutate(draftAccess)}
        >
          Save access
        </Button>
        <CliPreview command={putServiceModelAccessCli(shownAccess)} />
      </Card>
      <Card title={`Models (${rows.length})`}>
        {rows.some(
          (r) =>
            r.model.enabled &&
            r.model.priceState !== undefined &&
            r.model.priceState !== "approved",
        ) && (
          <Alert kind="warning" title="Some enabled models have no approved price">
            A model with no approved price cannot be called. Approve its price below.
          </Alert>
        )}
        <Table
          id="admin-models"
          caption="Models"
          filterLabel="Find models"
          status={catalog.isPending ? "loading" : catalog.isError ? "error" : "ready"}
          emptyText="No models."
          selection={{
            mode: "single",
            selected: selected ? [selected] : [],
            onChange: (ids) => setSelected(ids[0]),
          }}
          columns={[
            {
              id: "model",
              header: "Model",
              alwaysVisible: true,
              sortValue: (r) => r.model.id,
              cell: (r) => <code>{r.model.id}</code>,
            },
            {
              id: "provider",
              header: "Provider",
              sortValue: (r) => r.model.provider,
              cell: (r) => r.model.provider,
            },
            {
              id: "status",
              header: "Service",
              text: (r) => (r.model.enabled ? "Enabled" : "Disabled"),
              cell: (r) => (
                <StatusIndicator
                  view={
                    r.model.enabled
                      ? { word: "Enabled", dot: "green" }
                      : { word: "Disabled", dot: "grey" }
                  }
                />
              ),
            },
            {
              id: "price",
              header: "Price",
              text: (r) => priceView(r.model.priceState ?? (r.current ? "approved" : "none")).word,
              cell: (r) => (
                <StatusIndicator
                  view={priceView(r.model.priceState ?? (r.current ? "approved" : "none"))}
                />
              ),
            },
            {
              id: "teams",
              header: "Teams with access",
              cell: (r) => r.model.teamsWithAccess ?? "—",
            },
            {
              id: "toggle",
              header: "Actions",
              alwaysVisible: true,
              cell: (r) => (
                <Button
                  aria-label={`${r.model.enabled ? "Disable" : "Enable"} ${r.model.id}`}
                  disabled={toggle.isPending}
                  disabledReason={
                    modelsReason ??
                    (shownAccess === "all" ? "Switch to Selected models to change this" : undefined)
                  }
                  onClick={() =>
                    toggle.mutate({
                      id: r.model.id,
                      version: r.model.version,
                      enabled: !r.model.enabled,
                    })
                  }
                >
                  {r.model.enabled ? "Disable" : "Enable"}
                </Button>
              ),
            },
            { id: "in", header: "Input $/MTok", cell: (r) => rate(r.current?.inputUsdPerMtok) },
            { id: "out", header: "Output $/MTok", cell: (r) => rate(r.current?.outputUsdPerMtok) },
            {
              id: "eff",
              header: "Price effective",
              cell: (r) => (r.current ? day(r.current.effectiveFrom) : "—"),
            },
          ]}
          items={rows}
          getRowId={(r) => r.model.id}
        />
      </Card>
      <Card title={`Price changes waiting for approval (${pending.data?.length ?? 0})`}>
        <p>
          Read daily from the AWS Price List. An approved price applies from its effective date, or
          from approval if that is later. Budgets reserve spend at the approved price.
        </p>
        <Table
          id="admin-price-proposals"
          caption="Pending price proposals"
          status={pending.isPending ? "loading" : pending.isError ? "error" : "ready"}
          emptyText="No price changes are waiting."
          columns={[
            {
              id: "model",
              header: "Model",
              alwaysVisible: true,
              cell: (r) => <code>{r.proposal.modelId}</code>,
            },
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
            {
              id: "cache",
              header: "Cache read / write",
              cell: (r) =>
                `${rate(r.proposal.cacheReadUsdPerMtok)} / ${rate(r.proposal.cacheWriteUsdPerMtok)}`,
            },
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
                    aria-label={`Reject ${r.proposal.modelId}`}
                    disabledReason={reason}
                    onClick={() => setDeciding({ p: r.proposal, decision: "reject" })}
                  >
                    Reject
                  </Button>{" "}
                  <Button
                    variant="primary"
                    aria-label={`Approve ${r.proposal.modelId}`}
                    disabledReason={reason}
                    onClick={() => setDeciding({ p: r.proposal, decision: "approve" })}
                  >
                    Approve
                  </Button>
                </>
              ),
            },
          ]}
          items={pending.data ?? []}
          getRowId={(r) => r.proposal.id}
        />
      </Card>
      {sel && (
        <Card title={`${sel.id} · price history`}>
          <Table
            id="admin-price-history"
            caption={`Price history of ${sel.id}`}
            status={history.isPending ? "loading" : history.isError ? "error" : "ready"}
            emptyText="No prices yet."
            columns={[
              {
                id: "from",
                header: "Effective from",
                alwaysVisible: true,
                cell: (p) => utc(p.effectiveFrom),
              },
              { id: "in", header: "Input", cell: (p) => p.inputUsdPerMtok },
              { id: "out", header: "Output", cell: (p) => p.outputUsdPerMtok },
              { id: "cr", header: "Cache read", cell: (p) => rate(p.cacheReadUsdPerMtok) },
              { id: "cw", header: "Cache write", cell: (p) => rate(p.cacheWriteUsdPerMtok) },
              { id: "src", header: "Source", cell: (p) => p.source },
              { id: "by", header: "Changed by", cell: (p) => p.createdBy ?? "—" },
            ]}
            items={history.data ?? []}
            getRowId={(p) => p.effectiveFrom}
          />
        </Card>
      )}
      {deciding && (
        <ConfirmDialog
          title={`${deciding.decision === "approve" ? "Approve" : "Reject"} price change`}
          confirmLabel={deciding.decision === "approve" ? "Approve" : "Reject"}
          withNote={{ label: "Note (optional)" }}
          onCancel={() => setDeciding(undefined)}
          onConfirm={(note) =>
            decide.mutate({ id: deciding.p.id, decision: deciding.decision, note })
          }
        >
          {deciding.decision === "approve"
            ? `The new prices for ${deciding.p.modelId} apply from ${utc(deciding.p.effectiveFrom)}, or from approval if that is later.`
            : `The proposed prices for ${deciding.p.modelId} are discarded; the current prices stay.`}
        </ConfirmDialog>
      )}
    </div>
  );
}
