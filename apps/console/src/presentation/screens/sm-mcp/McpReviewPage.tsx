import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { McpPrimitiveRecord, McpReviewRecord } from "../../../application/ports/mcp.js";
import {
  APPROVAL_POLICIES,
  approvalSentence,
  classificationWord,
  mcpAuthWord,
  type ReviewDecision,
  reviewCli,
  reviewStatusView,
  transportWord,
} from "../../../domain/mcp.js";
import { can } from "../../../domain/me.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  KeyValue,
  PageHeader,
  SelectInput,
  StatusIndicator,
  Table,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import {
  AREA,
  ChecksList,
  ErrorAlert,
  InventoryTable,
  KindBadge,
  primitivesKey,
  RiskStatus,
  reviewsKey,
  serverKey,
  useApprovalPolicy,
} from "./shared.js";

/** SM4 (screen 49, MCP-WEB-4): the review queue, or one server's review at `/mcp-reviews/:mcpServerId`. */
export function McpReviewsPage() {
  const { mcpServerId } = useParams();
  const me = useMe();
  if (!can(me, "mcp-servers:review")) return <NotFoundPage />;
  return mcpServerId ? <ReviewServer id={mcpServerId} /> : <Queue />;
}

function Queue() {
  const uc = useService("mcpReviews");
  const q = useQuery({ queryKey: reviewsKey, queryFn: ({ signal }) => uc.queue(signal) });
  const status = q.isPending ? "loading" : q.isError ? "error" : "ready";
  const since = (r: McpReviewRecord) => <time dateTime={r.since}>{formatLocal(r.since)}</time>;
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "MCP reviews" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="MCP reviews"
        description="Team-registered servers waiting for a decision, and changed or new tool definitions held until approved. Oldest first."
        infoHref="/docs/mcp-servers"
      />
      <ErrorAlert errors={[q.error]} />
      <Card title={`Servers (${q.data?.servers.length ?? 0})`}>
        <Table
          id="mcp-review-servers"
          caption="Servers waiting for review"
          status={status}
          emptyText="No server is waiting for review."
          items={q.data?.servers ?? []}
          getRowId={(r) => r.serverId}
          columns={[
            {
              id: "server",
              header: "Server",
              alwaysVisible: true,
              sortValue: (r) => r.slug,
              cell: (r) => (
                <Link to={`/mcp-reviews/${r.serverId}`}>
                  <code>{r.slug}</code>
                </Link>
              ),
            },
            { id: "team", header: "Team", cell: (r) => r.teamId ?? "—" },
            { id: "risk", header: "Risk", cell: (r) => <RiskStatus tier={r.riskTier} /> },
            {
              id: "approver",
              header: "Approver",
              cell: (r) => (r.approver === "security" ? "Security" : "Team-admin"),
            },
            { id: "since", header: "Waiting since", sortValue: (r) => r.since, cell: since },
          ]}
        />
      </Card>
      <Card title={`Held definitions (${q.data?.primitives.length ?? 0})`}>
        <Table
          id="mcp-review-primitives"
          caption="Held tool, resource and prompt definitions"
          status={status}
          emptyText="No definition is held."
          items={q.data?.primitives ?? []}
          getRowId={(r) => `${r.serverId}/${r.primitiveId ?? r.name ?? ""}`}
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              cell: (r) => (
                <Link to={`/mcp-servers/${r.serverId}?tab=primitives`}>
                  <code>
                    {r.slug} · {r.name ?? r.primitiveId}
                  </code>
                </Link>
              ),
            },
            { id: "team", header: "Team", cell: (r) => r.teamId ?? "All teams" },
            { id: "risk", header: "Risk", cell: (r) => <RiskStatus tier={r.riskTier} /> },
            { id: "since", header: "Held since", sortValue: (r) => r.since, cell: since },
          ]}
        />
      </Card>
    </div>
  );
}

function ReviewServer({ id }: { id: string }) {
  const catalog = useService("mcpCatalog");
  const reviews = useService("mcpReviews");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const noteId = useId();
  const policy = useApprovalPolicy();
  const server = useQuery({
    queryKey: serverKey(id),
    queryFn: ({ signal }) => catalog.detail(id, signal),
  });
  const prims = useQuery({
    queryKey: primitivesKey(id),
    queryFn: ({ signal }) => catalog.primitives(id, signal),
  });
  const [note, setNote] = useState("");
  const [blocks, setBlocks] = useState<Record<string, "approve" | "block">>({});
  const decide = useMutation({
    mutationFn: (d: ReviewDecision) =>
      reviews.decide(id, d, { note, primitives: decisions(prims.data ?? [], blocks) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      navigate("/mcp-reviews");
    },
  });
  const s = server.data;
  const reason = gate(me, "mcp-servers:review");
  const err = isAppError(decide.error) ? decide.error : undefined;
  const pending = s?.reviewStatus === "pending_review";
  const blockReason = reason ?? (pending ? undefined : "Only a pending server is decided here");
  const decided = decisions(prims.data ?? [], blocks);
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "MCP reviews", to: "/mcp-reviews" },
          { label: s?.slug ?? id },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <ErrorAlert errors={[server.error, prims.error]} />
      {s && (
        <>
          <PageHeader
            title={s.slug}
            description={`Registered by ${s.createdBy}${s.teamId ? ` (${s.teamId})` : ""} ${formatLocal(s.createdAt)}. Purpose: ${s.purpose ?? "—"}`}
            actions={
              <>
                <KindBadge scope={s.scope} /> <StatusIndicator view={reviewStatusView(s)} />{" "}
                <RiskStatus tier={s.riskTier} />
                <Button
                  disabledReason={blockReason}
                  disabled={decide.isPending}
                  onClick={() => decide.mutate("request-changes")}
                >
                  Ask team for changes
                </Button>
                <Button
                  disabledReason={blockReason}
                  disabled={decide.isPending}
                  onClick={() => decide.mutate("reject")}
                >
                  Reject
                </Button>
                <Button
                  variant="primary"
                  disabledReason={blockReason}
                  disabled={decide.isPending}
                  onClick={() => decide.mutate("approve")}
                >
                  Approve
                </Button>
              </>
            }
          />
          {err && Object.keys(err.fields).length === 0 && (
            <ErrorAlert errors={[err]} title="The decision was not recorded" />
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 360px", minWidth: 0 }}>
              <Card title="Automatic checks">
                <p>Run at registration and on every inventory change.</p>
                <ChecksList checks={s.checks ?? []} />
              </Card>
              <Card title={`Why ${(s.riskTier ?? "this tier").toLowerCase()}`}>
                {(s.riskReasons ?? []).length > 0 && (
                  <ul>
                    {(s.riskReasons ?? []).map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                <p>
                  {policy ? (
                    <>
                      Service approval policy:{" "}
                      <b>{APPROVAL_POLICIES.find((p) => p.value === policy)?.label ?? policy}</b>.{" "}
                      {approvalSentence(policy, s.riskTier)}
                    </>
                  ) : s.approver === "security" ? (
                    "Under the service approval policy this tier needs a security operator or service admin."
                  ) : (
                    "Under the service approval policy the team-admin may approve this tier; a security operator or service admin may decide it too."
                  )}{" "}
                  Approving publishes it to {s.teamId ?? "its team"} only; it is proxied, pinned and
                  logged like enterprise servers.
                </p>
                <KeyValue
                  items={[
                    { label: "Transport", value: transportWord(s.transport, s.location) },
                    { label: "Authentication", value: mcpAuthWord(s.authKind) },
                    {
                      label: "Data classification",
                      value: classificationWord(s.dataClassification),
                    },
                  ]}
                />
              </Card>
            </div>
            <div style={{ flex: "1 1 360px", minWidth: 0 }}>
              <Card title={`Inventory (${prims.data?.length ?? 0})`}>
                <InventoryTable
                  id="mcp-review-inventory"
                  items={prims.data ?? []}
                  status={prims.isPending ? "loading" : prims.isError ? "error" : "ready"}
                  decision={{
                    id: "decision",
                    header: "Decision",
                    alwaysVisible: true,
                    cell: (p) => (
                      <SelectInput
                        aria-label={`Decision for ${p.name}`}
                        aria-disabled={blockReason !== undefined || undefined}
                        value={blocks[p.id] ?? (p.status === "blocked" ? "block" : "approve")}
                        options={[
                          { value: "approve", label: "Allow" },
                          { value: "block", label: "Block" },
                        ]}
                        onChange={(e) =>
                          blockReason === undefined &&
                          setBlocks({ ...blocks, [p.id]: e.target.value as "approve" | "block" })
                        }
                      />
                    ),
                  }}
                />
              </Card>
              <Card title="Decision note">
                <label htmlFor={noteId}>Note (required, recorded in the audit log)</label>
                <textarea
                  id={noteId}
                  rows={3}
                  style={{ width: "100%" }}
                  value={note}
                  aria-invalid={err?.fields.note ? true : undefined}
                  onChange={(e) => setNote(e.target.value)}
                />
                {err?.fields.note && <p role="alert">{err.fields.note}</p>}
                <CliPreview command={reviewCli("approve", s.id, note || "<note>", decided)} />
              </Card>
            </div>
          </div>
          {!pending && (
            <Alert kind="info" title="Already decided">
              This server is {reviewStatusView(s).word.toLowerCase()}.
            </Alert>
          )}
        </>
      )}
    </div>
  );
}

/** Only the primitives whose decision differs from their state are sent. */
function decisions(
  items: readonly McpPrimitiveRecord[],
  chosen: Readonly<Record<string, "approve" | "block">>,
) {
  return items
    .filter((p) => chosen[p.id] !== undefined)
    .map((p) => ({ primitiveId: p.id, decision: chosen[p.id] as string }));
}
