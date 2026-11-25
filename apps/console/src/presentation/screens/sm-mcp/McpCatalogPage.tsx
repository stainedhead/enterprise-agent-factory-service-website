import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { McpServerRecord } from "../../../application/ports/mcp.js";
import { McpUsageUseCases } from "../../../application/usecases/mcp/McpUseCases.js";
import {
  importMcpServerManifestCli,
  kindWord,
  mcpAuthWord,
  pct,
  reviewStatusView,
  riskView,
  transportWord,
} from "../../../domain/mcp.js";
import { can } from "../../../domain/me.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  FormField,
  Modal,
  PageHeader,
  StatusIndicator,
  Table,
  TextInput,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import {
  AREA,
  catalogKey,
  ErrorAlert,
  KindBadge,
  num,
  RiskStatus,
  reviewsKey,
  usageKey,
} from "./shared.js";

const STATUSES = ["draft", "pending_review", "approved", "rejected", "suspended"];

/** SM1 (screen 46, MCP-WEB-1): the enterprise catalog and every team-managed server, with review and usage. */
export function McpCatalogPage() {
  const uc = useService("mcpCatalog");
  const reviews = useService("mcpReviews");
  const usage = useOptionalService("mcpUsage");
  const me = useMe();
  const navigate = useNavigate();
  const writeReason = gate(me, "mcp-servers:write");
  const [importing, setImporting] = useState(false);
  const catalog = useQuery({ queryKey: catalogKey, queryFn: ({ signal }) => uc.catalog(signal) });
  const queue = useQuery({
    queryKey: reviewsKey,
    queryFn: ({ signal }) => reviews.queue(signal),
    enabled: can(me, "mcp-servers:review"),
  });
  const mayReadUsage = usage !== undefined && can(me, "mcp-events:read");
  const calls = useQuery({
    queryKey: usageKey("service", { view: "usage", groupBy: "server" }),
    queryFn: ({ signal }) =>
      usage
        ? usage.run({ level: "service" }, { view: "usage", groupBy: "server" }, signal)
        : Promise.reject(new Error("no usage service")),
    enabled: mayReadUsage,
    retry: false,
  });
  const discovery = useQuery({
    queryKey: usageKey("service", { view: "discovery", groupBy: "server" }),
    queryFn: ({ signal }) =>
      usage
        ? usage.run({ level: "service" }, { view: "discovery", groupBy: "server" }, signal)
        : Promise.reject(new Error("no usage service")),
    enabled: mayReadUsage,
    retry: false,
  });
  const c = catalog.data;
  const all: McpServerRecord[] = c ? [...c.enterprise, ...c.team] : [];
  const totals = calls.data ? McpUsageUseCases.totals(calls.data.rows) : undefined;
  const searches = (discovery.data?.rows ?? []).reduce((a, r) => a + (r.searches ?? 0), 0);
  const hits = (discovery.data?.rows ?? []).reduce(
    (a, r) => a + (r.searches ?? 0) * (r.searchHitRate ?? 0),
    0,
  );
  const pendingServers = queue.data?.servers.length ?? 0;
  const heldPrimitives = queue.data?.primitives.length ?? 0;
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "MCP servers" }]}
        renderLink={(x) => <Link to={x.to ?? "/"}>{x.label}</Link>}
      />
      <PageHeader
        title="MCP servers"
        description="Agents reach every server through their team's gateway. Agents hold no MCP credentials; the gateway injects or mints them per call. Teams switch enterprise servers on from this catalog."
        infoHref="/docs/mcp-servers"
        actions={
          <>
            <Button disabledReason={writeReason} onClick={() => setImporting(true)}>
              Import server.json
            </Button>
            <Button
              variant="primary"
              disabledReason={writeReason}
              onClick={() => navigate("/mcp-servers/new")}
            >
              Add enterprise server
            </Button>
          </>
        }
      />
      <ErrorAlert errors={[catalog.error, queue.error]} />
      {pendingServers + heldPrimitives > 0 && (
        <Alert kind="warning" title={`${pendingServers + heldPrimitives} items need review.`}>
          {pendingServers} team-registered server{pendingServers === 1 ? " is" : "s are"} waiting
          for review; {heldPrimitives} changed or new definition
          {heldPrimitives === 1 ? " is" : "s are"} held and not callable until approved.{" "}
          <Link to="/mcp-reviews">Open review queue</Link>
        </Alert>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        <Card title="Enterprise servers">
          <p style={{ fontSize: 28, margin: 0 }}>{c ? c.enterprise.length : "—"}</p>
          <p>{c ? `${c.counts.published} published · ${c.counts.drafts} draft` : ""}</p>
        </Card>
        <Card title="Team-managed servers">
          <p style={{ fontSize: 28, margin: 0 }}>{c ? c.team.length : "—"}</p>
          <p>
            {c
              ? `${c.counts.teamApproved} approved · ${c.counts.teamPending} pending · ${c.counts.teamRejected} rejected`
              : ""}
          </p>
        </Card>
        <Card title="MCP calls">
          <p style={{ fontSize: 28, margin: 0 }}>{totals ? num(totals.calls) : "—"}</p>
          <p>
            {totals
              ? `${pct(totals.errors, totals.calls)} tool errors · ${num(totals.refusals)} refused`
              : "Needs MCP usage access"}
          </p>
        </Card>
        <Card title="Discovery">
          <p style={{ fontSize: 28, margin: 0 }}>{searches > 0 ? pct(hits, searches) : "—"}</p>
          <p>of afs_search calls led to a call</p>
        </Card>
      </div>
      <Card title={`MCP servers (${all.length})`}>
        <Table
          id="mcp-catalog"
          caption="MCP servers"
          filterLabel="Find servers by name, owner or tool"
          status={catalog.isPending ? "loading" : catalog.isError ? "error" : "ready"}
          emptyText="No MCP servers yet. Add an enterprise server or import a server.json."
          items={all}
          getRowId={(s) => s.id}
          propertyFilters={[
            {
              id: "kind",
              label: "Kind",
              options: ["enterprise", "team"].map((v) => ({ value: v, label: kindWord(v) })),
              match: (s, v) => s.scope === v,
            },
            {
              id: "status",
              label: "Status",
              options: STATUSES.map((v) => ({
                value: v,
                label: reviewStatusView({ reviewStatus: v, scope: "team" }).word,
              })),
              match: (s, v) => s.reviewStatus === v,
            },
            {
              id: "risk",
              label: "Risk",
              options: ["low", "elevated", "high"].map((v) => ({
                value: v,
                label: riskView(v).word,
              })),
              match: (s, v) => s.riskTier === v,
            },
          ]}
          columns={[
            {
              id: "server",
              header: "Server",
              alwaysVisible: true,
              sortValue: (s) => s.slug,
              text: (s) => `${s.slug} ${s.displayName} ${s.owner ?? ""}`,
              cell: (s) => (
                <>
                  <Link to={`/mcp-servers/${s.id}`}>
                    <code>{s.slug}</code>
                  </Link>
                  <div>{s.displayName}</div>
                </>
              ),
            },
            { id: "kind", header: "Kind", cell: (s) => <KindBadge scope={s.scope} /> },
            {
              id: "transport",
              header: "Transport",
              cell: (s) => transportWord(s.transport, s.location),
            },
            { id: "auth", header: "Auth to server", cell: (s) => mcpAuthWord(s.authKind) },
            {
              id: "status",
              header: "Status",
              text: (s) => reviewStatusView(s).word,
              cell: (s) => <StatusIndicator view={reviewStatusView(s)} />,
            },
            { id: "risk", header: "Risk", cell: (s) => <RiskStatus tier={s.riskTier} /> },
            {
              id: "used",
              header: "Used by",
              sortValue: (s) => s.adoption?.teams ?? 0,
              cell: (s) =>
                s.adoption ? `${s.adoption.teams} team${s.adoption.teams === 1 ? "" : "s"}` : "—",
            },
          ]}
        />
      </Card>
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

/** *Import server.json* (MCP-US-1 AC-1.2): a draft is pre-filled; it is reviewed before publishing. */
function ImportDialog({ onClose }: { onClose: () => void }) {
  const uc = useService("mcpCatalog");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [slug, setSlug] = useState("");
  const areaId = useId();
  const run = useMutation({
    mutationFn: () => uc.importManifest(text, slug),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      navigate(`/mcp-servers/${s.id}`);
    },
  });
  const err = isAppError(run.error) ? run.error : undefined;
  return (
    <Modal
      title="Import server.json"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={run.isPending} onClick={() => run.mutate()}>
            Import as draft
          </Button>
        </>
      }
    >
      {err && !err.fields.manifest && <ErrorAlert errors={[err]} title="The import failed" />}
      <p>
        An MCP Registry server.json pre-fills a draft. Imported values are a draft until you review
        them; importing never counts as approval.
      </p>
      <div>
        <label htmlFor={areaId}>server.json</label>
        <textarea
          id={areaId}
          rows={8}
          style={{ width: "100%", fontFamily: "monospace" }}
          value={text}
          aria-invalid={err?.fields.manifest ? true : undefined}
          aria-describedby={err?.fields.manifest ? `${areaId}-err` : undefined}
          onChange={(e) => setText(e.target.value)}
        />
        {err?.fields.manifest && (
          <p id={`${areaId}-err`} role="alert">
            {err.fields.manifest}
          </p>
        )}
      </div>
      <FormField label="Slug (optional)" hint="Overrides the slug derived from the manifest name">
        <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} />
      </FormField>
      <CliPreview command={importMcpServerManifestCli(slug.trim() || undefined)} />
    </Modal>
  );
}
