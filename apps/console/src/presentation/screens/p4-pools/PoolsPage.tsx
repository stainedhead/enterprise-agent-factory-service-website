import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type {
  PoolRecord,
  PoolRoleLinkRecord,
  StageRecord,
} from "../../../application/ports/pools.js";
import {
  orderStages,
  poolStateWord,
  templateRetired,
} from "../../../application/usecases/pools/PoolsUseCases.js";
import { buildCli } from "../../../domain/cli.js";
import { format } from "../../../domain/money.js";
import { formatLocal, utcTitle } from "../../../domain/time.js";
import {
  ActionsMenu,
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  PageHeader,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { HandoffsDialog, ScaleDialog, SharedRoleDialog, StageDialog } from "./Dialogs.js";
import { poolsKey } from "./keys.js";

type Dialog =
  | { kind: "scale" | "delete" | "handoffs" | "role" }
  | { kind: "stage"; stage?: StageRecord }
  | { kind: "delete-stage"; stage: StageRecord };

const NO_STAGE = "__none__";

const roleSummary = (links: readonly PoolRoleLinkRecord[] | undefined) => {
  const l = links ?? [];
  if (l.length === 0) return "—";
  const verified = l.every((x) => x.status === "verified");
  return `${l[0]?.roleName} · ${l.length} account${l.length === 1 ? "" : "s"}${verified ? " ✓" : ""}`;
};

/**
 * P4 (WEB-US-39): the stages of an ephemeral team in order, each with its pools; worker counts by what they
 * report, handoffs, storage, the shared named role and spend. Every control needs `pools:write`.
 */
export function PoolsPage() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  const uc = useService("pools");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("pools:write");
  const [selected, setSelected] = useState<string | undefined>();
  const [dialog, setDialog] = useState<Dialog | undefined>();
  const [notice, setNotice] = useState<string | undefined>();

  const list = usePolledQuery({
    queryKey: poolsKey(teamId, "list"),
    queryFn: ({ signal }) => uc.list(teamId, signal),
    phasesOf: (ps) => ps.map((p) => p.status.phase),
  });
  const pools = list.data ?? [];
  const ids = pools.map((p) => p.id);
  const stagesQ = useQuery({
    queryKey: poolsKey(teamId, "stages"),
    queryFn: ({ signal }) => uc.stages(teamId, signal),
  });
  const statuses = usePolledQuery({
    queryKey: [...poolsKey(teamId, "statuses"), ids],
    queryFn: ({ signal }) => uc.statuses(teamId, ids, signal),
    phasesOf: (s) => Object.values(s).map((x) => x.status.phase),
    enabled: list.isSuccess && ids.length > 0,
  });
  const links = useQuery({
    queryKey: [...poolsKey(teamId, "links"), ids],
    queryFn: ({ signal }) => uc.linksFor(teamId, ids, signal),
    enabled: list.isSuccess && ids.length > 0,
  });
  const templates = useQuery({
    queryKey: queryKey({ area: "agents", resource: "templates" }),
    queryFn: ({ signal }) => uc.templates(signal),
    retry: false,
  });
  const spend = useQuery({
    queryKey: poolsKey(teamId, "spend"),
    queryFn: ({ signal }) => uc.spendByPool(teamId, signal),
    retry: false,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: poolsKey(teamId) });

  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
  });
  const act = (fn: () => Promise<unknown>, done?: string) =>
    run.mutate(async () => {
      await fn();
      if (done) setNotice(done);
    });

  const sel = pools.find((p) => p.id === selected);
  const nameOf = (id: string) => pools.find((p) => p.id === id)?.name ?? id;
  const stages = orderStages(stagesQ.data ?? []);
  const groups: { key: string; stage?: StageRecord; pools: PoolRecord[] }[] = [
    ...stages.map((s) => ({ key: s.id, stage: s, pools: pools.filter((p) => p.stageId === s.id) })),
  ];
  const loose = pools.filter((p) => !p.stageId || !stages.some((s) => s.id === p.stageId));
  if (loose.length > 0) groups.push({ key: NO_STAGE, pools: loose });
  const needsPool = reason ?? (sel ? undefined : "Select a pool first");
  const err = run.error && isAppError(run.error) ? run.error : undefined;
  const dialogError = dialog ? run.error : undefined;

  const actions = reason ? (
    <Button disabledReason={reason}>Actions ▾</Button>
  ) : (
    <ActionsMenu
      actions={[
        {
          id: "scale",
          label: "Scale",
          onSelect: () => setDialog({ kind: "scale" }),
          disabledReason: needsPool,
        },
        {
          id: "handoffs",
          label: "Edit handoffs",
          onSelect: () => setDialog({ kind: "handoffs" }),
          disabledReason: needsPool,
        },
        {
          id: "role",
          label: "Link shared role",
          onSelect: () => setDialog({ kind: "role" }),
          disabledReason: needsPool,
        },
        {
          id: "pause",
          label: "Pause",
          onSelect: () => sel && act(() => uc.pause(teamId, sel)),
          disabledReason:
            needsPool ?? (sel?.state === "enabled" ? undefined : "The pool is not running"),
        },
        {
          id: "resume",
          label: "Resume",
          onSelect: () => sel && act(() => uc.resume(teamId, sel)),
          disabledReason:
            needsPool ?? (sel?.state === "paused" ? undefined : "The pool is not paused"),
        },
        {
          id: "delete",
          label: "Delete",
          onSelect: () => setDialog({ kind: "delete" }),
          disabledReason: needsPool,
        },
      ]}
    />
  );

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Pools & stages" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Pools & stages"
        description="Stages run in order; each holds pools of workers that hand work to the next."
        actions={
          <>
            <Button disabledReason={reason} onClick={() => setDialog({ kind: "stage" })}>
              Add stage
            </Button>
            {actions}
            <Button
              variant="primary"
              disabledReason={reason}
              onClick={() => navigate(`/t/${teamId}/pools/new`)}
            >
              Create pool
            </Button>
          </>
        }
      />
      <Badge tone="purple">Ephemeral</Badge>
      {notice && (
        <Alert kind="success" onDismiss={() => setNotice(undefined)}>
          {notice}
        </Alert>
      )}
      {err && !dialog && !err.isAccessDenied && (
        <Alert kind="error" title="The change was not applied" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      {err?.isAccessDenied && !dialog && (
        <Alert kind="error" title="You do not have access" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      {list.isError && (
        <Alert kind="error" title="Pools could not be loaded">
          {isAppError(list.error) ? list.error.message : "Try again."}
        </Alert>
      )}
      {list.isSuccess && groups.length === 0 && (
        <Card title="Pools">
          <p>No pools or stages yet. Add a stage, then create a pool.</p>
        </Card>
      )}
      {groups.map((g) => (
        <Card
          key={g.key}
          title={g.stage ? `Stage ${g.stage.position} · ${g.stage.name}` : "Pools without a stage"}
          actions={
            g.stage ? (
              <>
                <Button
                  aria-label={`Move stage ${g.stage.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "stage", stage: g.stage as StageRecord })}
                >
                  Move
                </Button>
                <Button
                  aria-label={`Delete stage ${g.stage.name}`}
                  disabledReason={reason}
                  onClick={() => setDialog({ kind: "delete-stage", stage: g.stage as StageRecord })}
                >
                  Delete stage
                </Button>
              </>
            ) : undefined
          }
        >
          {g.stage?.description && <p>{g.stage.description}</p>}
          <Table
            id={`pools-${g.key}`}
            caption={g.stage ? `Pools in stage ${g.stage.name}` : "Pools without a stage"}
            filterLabel="Find pools"
            emptyText="No pools in this stage."
            selection={{
              mode: "single",
              selected: selected ? [selected] : [],
              onChange: (s) => setSelected(s[0]),
            }}
            items={g.pools}
            getRowId={(p) => p.id}
            columns={[
              {
                id: "name",
                header: "Pool",
                alwaysVisible: true,
                sortValue: (p) => p.name,
                text: (p) => p.name,
                cell: (p) => (
                  <span>
                    {p.name}{" "}
                    {templateRetired(p, templates.data ?? []) && <Badge>Template retired</Badge>}
                  </span>
                ),
              },
              {
                id: "template",
                header: "Template",
                sortValue: (p) => p.template,
                cell: (p) => p.template,
              },
              { id: "model", header: "Model", sortValue: (p) => p.modelId, cell: (p) => p.modelId },
              {
                id: "workers",
                header: "Workers",
                sortValue: (p) => p.workers,
                cell: (p) => p.workers,
              },
              {
                id: "status",
                header: "Status",
                text: (p) => p.status.phase,
                cell: (p) => {
                  const w = statuses.data?.[p.id]?.workers;
                  return (
                    <div>
                      {poolStateWord(p) === "Paused" ? (
                        <StatusIndicator view={{ word: "Paused", dot: "grey" }} />
                      ) : (
                        <StatusIndicator status={p.status} />
                      )}
                      {w && (
                        <div>
                          {w.reporting} reporting · {w.working} working · {w.idle} idle ·{" "}
                          {w.impaired} impaired
                        </div>
                      )}
                    </div>
                  );
                },
              },
              {
                id: "handoffs",
                header: "Hands work to",
                text: (p) => p.handoffs.map(nameOf).join(" "),
                cell: (p) => (p.handoffs.length > 0 ? p.handoffs.map(nameOf).join(", ") : "—"),
              },
              {
                id: "storage",
                header: "Storage",
                cell: (p) =>
                  `Scratch ${p.scratchSizeGiB ?? "—"} GiB${p.sharedVolume === "efs" ? " + shared EFS" : ""}`,
              },
              {
                id: "role",
                header: "Shared role",
                cell: (p) => roleSummary(links.data?.[p.id]),
              },
              {
                id: "spend",
                header: "Spend",
                cell: (p) => (spend.data?.[p.id] ? format(spend.data[p.id] as string) : "—"),
              },
            ]}
          />
        </Card>
      ))}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <section style={{ flex: "1 1 420px" }} aria-label="Handoffs">
          <Card title="Handoffs">
            {pools.filter((p) => p.handoffs.length > 0).length === 0 ? (
              <p>No pool hands work to another pool.</p>
            ) : (
              <ul>
                {pools
                  .filter((p) => p.handoffs.length > 0)
                  .map((p) => (
                    <li key={p.id}>
                      {p.name} → {p.handoffs.map(nameOf).join(", ")}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </section>
        <section style={{ flex: "1 1 420px" }} aria-label="Selected pool">
          <Card title={sel ? `Shared role of ${sel.name}` : "Shared role"}>
            {!sel && <p>Select a pool to see its shared role and the equivalent CLI command.</p>}
            {sel && (
              <>
                {(links.data?.[sel.id] ?? []).length === 0 && <p>No shared role is linked.</p>}
                <ul>
                  {(links.data?.[sel.id] ?? []).map((l) => (
                    <li key={l.id}>
                      {l.roleName} in {l.accountId} ·{" "}
                      <StatusIndicator
                        status={{
                          phase:
                            l.status === "verified"
                              ? "Ready"
                              : l.status === "failed"
                                ? "Failed"
                                : "Pending",
                        }}
                      />
                      {l.lastVerifiedAt && (
                        <>
                          {" "}
                          · verified{" "}
                          <time dateTime={l.lastVerifiedAt} title={utcTitle(l.lastVerifiedAt)}>
                            {formatLocal(l.lastVerifiedAt)}
                          </time>
                        </>
                      )}
                      {l.lastError && <div role="alert">{l.lastError}</div>}{" "}
                      <Button
                        aria-label={`Verify ${l.roleName} in ${l.accountId}`}
                        disabledReason={reason}
                        onClick={() => act(() => uc.verifyLink(teamId, sel.id, l.id))}
                      >
                        Verify
                      </Button>{" "}
                      <Button
                        aria-label={`Remove ${l.roleName} in ${l.accountId}`}
                        disabledReason={reason}
                        onClick={() => act(() => uc.deleteLink(teamId, sel.id, l))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
                <CliPreview
                  command={buildCli("ScalePool", { teamId, poolId: sel.id, workers: sel.workers })}
                />
              </>
            )}
          </Card>
        </section>
      </div>
      {dialog?.kind === "scale" && sel && (
        <ScaleDialog
          teamId={teamId}
          pool={sel}
          busy={run.isPending}
          error={dialogError}
          onCancel={() => {
            run.reset();
            setDialog(undefined);
          }}
          onScale={(w) => act(() => uc.scale(teamId, sel, w))}
        />
      )}
      {dialog?.kind === "delete" && sel && (
        <ConfirmDialog
          title={`Delete ${sel.name}`}
          confirmLabel="Delete"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => {
            act(() => uc.delete(teamId, sel));
            setSelected(undefined);
          }}
        >
          <p>
            The pool's workers stop and the pool is removed. Its name cannot be reused until it is
            gone.
          </p>
          <CliPreview command={buildCli("DeletePool", { teamId, poolId: sel.id })} />
        </ConfirmDialog>
      )}
      {dialog?.kind === "handoffs" && sel && (
        <HandoffsDialog
          teamId={teamId}
          pool={sel}
          others={pools.filter((p) => p.id !== sel.id)}
          busy={run.isPending}
          error={dialogError}
          onCancel={() => {
            run.reset();
            setDialog(undefined);
          }}
          onSave={(to) => act(() => uc.saveHandoffs(teamId, sel, to))}
        />
      )}
      {dialog?.kind === "role" && sel && (
        <SharedRoleDialog
          teamId={teamId}
          existing={links.data?.[sel.id] ?? []}
          busy={run.isPending}
          error={dialogError}
          onCancel={() => {
            run.reset();
            setDialog(undefined);
          }}
          onLink={(role, accounts, allowed) =>
            act(async () => {
              const r = await uc.linkSharedRole(
                teamId,
                sel.id,
                role,
                accounts,
                allowed,
                links.data?.[sel.id] ?? [],
              );
              if (r.failed.length > 0)
                setNotice(
                  `Not linked: ${r.failed.map((f) => `${f.accountId} (${f.message})`).join("; ")}`,
                );
            })
          }
        />
      )}
      {dialog?.kind === "stage" && (
        <StageDialog
          teamId={teamId}
          {...(dialog.stage && { stage: dialog.stage })}
          busy={run.isPending}
          error={dialogError}
          onCancel={() => {
            run.reset();
            setDialog(undefined);
          }}
          onSave={(v) => {
            const stage = dialog.stage;
            act(() =>
              stage
                ? uc.moveStage(teamId, stage, Number(v.position))
                : uc.createStage(teamId, v.name, Number(v.position), v.description || undefined),
            );
          }}
        />
      )}
      {dialog?.kind === "delete-stage" && (
        <ConfirmDialog
          title={`Delete stage ${dialog.stage.name}`}
          confirmLabel="Delete stage"
          onCancel={() => setDialog(undefined)}
          onConfirm={() =>
            act(() => uc.deleteStage(teamId, (dialog as { stage: StageRecord }).stage))
          }
        >
          <p>Pools in the stage keep running and move to "Pools without a stage".</p>
          <CliPreview command={buildCli("DeleteStage", { teamId, stageId: dialog.stage.id })} />
        </ConfirmDialog>
      )}
    </div>
  );
}
