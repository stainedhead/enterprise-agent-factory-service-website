import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { ProposalRecord } from "../../../application/ports/adminModels.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey, queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
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
  const err = [catalog.error, pending.error, decide.error]
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
      <Card title={`Models (${rows.length})`}>
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
              header: "Status",
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
