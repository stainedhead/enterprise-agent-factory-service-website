import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { McpPrimitiveRecord, McpServerRecord } from "../../../application/ports/mcp.js";
import { McpUsageUseCases } from "../../../application/usecases/mcp/McpUseCases.js";
import {
  classificationWord,
  mcpAuthWord,
  mcpCredentialView,
  ms,
  pct,
  primitiveStatusView,
  publishMcpServerCli,
  putMcpPolicyCli,
  putMcpServerCredentialCli,
  reviewStatusView,
  suspendMcpServerCli,
  transportWord,
  usesSecretValue,
} from "../../../domain/mcp.js";
import { can } from "../../../domain/me.js";
import { MCP_SERVER_TABS, type McpServerTab } from "../../../domain/navigation.js";
import { formatLocal } from "../../../domain/time.js";
import {
  ActionsMenu,
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  DiffView,
  FormField,
  KeyValue,
  PageHeader,
  StatusIndicator,
  Switch,
  Table,
  Tabs,
  TextInput,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { NotFoundPage } from "../../shell/pages.js";
import { useMe } from "../../shell/ShellContext.js";
import { CredentialDialog } from "./CredentialDialog.js";
import { PolicyEditor } from "./PolicyEditor.js";
import {
  AREA,
  ChecksList,
  ErrorAlert,
  KindBadge,
  num,
  primitiveColumns,
  primitivesKey,
  RiskStatus,
  serverKey,
  usageKey,
} from "./shared.js";

const isTab = (v: string | null): v is McpServerTab => MCP_SERVER_TABS.some((t) => t.id === v);

/** SM3 (screen 47, MCP-WEB-1): one server's overview, inventory and held changes, policy, credentials and use. */
export function McpServerDetailPage() {
  const { mcpServerId = "" } = useParams();
  const uc = useService("mcpCatalog");
  const me = useMe();
  const [search, setSearch] = useSearchParams();
  const tab = isTab(search.get("tab")) ? (search.get("tab") as McpServerTab) : "overview";
  const server = useQuery({
    queryKey: serverKey(mcpServerId),
    queryFn: ({ signal }) => uc.detail(mcpServerId, signal),
  });
  const s = server.data;
  if (server.isError && isNotFound(server.error)) return <NotFoundPage />;
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "MCP servers", to: "/mcp-servers" },
          { label: s?.slug ?? mcpServerId },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <ErrorAlert errors={[server.error]} />
      {s && (
        <>
          <Header s={s} />
          {s.reviewStatus === "suspended" && (
            <Alert kind="error" title="Suspended">
              {s.suspendedReason ?? "Calls are refused for every team until it is resumed."}
            </Alert>
          )}
          {s.scope === "team" && s.reviewStatus === "pending_review" && (
            <Alert kind="warning" title="Waiting for review">
              {can(me, "mcp-servers:review") ? (
                <Link to={`/mcp-reviews/${s.id}`}>Open the review</Link>
              ) : (
                "A reviewer decides it from the MCP review queue."
              )}
            </Alert>
          )}
          <Tabs
            label="MCP server"
            activeId={tab}
            onChange={(id) => setSearch(id === "overview" ? {} : { tab: id }, { replace: true })}
            tabs={MCP_SERVER_TABS.map((t) => ({
              id: t.id,
              label: t.id === "teams" && s.adoption ? `Teams (${s.adoption.teams})` : t.label,
              content: <TabContent tab={t.id} s={s} />,
            }))}
          />
        </>
      )}
    </div>
  );
}

const isNotFound = (e: unknown) => isAppError(e) && e.kind === "not-found";

function TabContent({ tab, s }: { tab: McpServerTab; s: McpServerRecord }) {
  switch (tab) {
    case "overview":
      return <Overview s={s} />;
    case "primitives":
      return <Inventory s={s} />;
    case "policy":
      return <ServicePolicy s={s} />;
    case "credentials":
      return <Credentials s={s} />;
    case "teams":
      return <Teams s={s} />;
    case "usage":
      return <Usage s={s} />;
  }
}

function Header({ s }: { s: McpServerRecord }) {
  const uc = useService("mcpCatalog");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<"publish" | "retire" | "suspend" | "resume" | "delete">();
  const write = gate(me, "mcp-servers:write");
  const suspendReason = gate(me, "mcp-servers:suspend");
  const done = () => void qc.invalidateQueries({ queryKey: areaKey(AREA) });
  const act = useMutation({
    mutationFn: async ({ what, note }: { what: string; note?: string | undefined }) => {
      switch (what) {
        case "publish":
          return uc.publish(s, note);
        case "retire":
          return uc.retire(s.id, note);
        case "suspend":
          return uc.suspend(s.id, true, note ?? "");
        case "resume":
          return uc.suspend(s.id, false, note ?? "");
        case "delete":
          await uc.delete(s);
          navigate("/mcp-servers");
          return undefined;
        default:
          return uc.refresh(s.id);
      }
    },
    onSettled: () => {
      setConfirm(undefined);
      done();
    },
  });
  const enterprise = s.scope === "enterprise";
  const canPublish =
    enterprise && !s.published && (s.reviewStatus === "draft" || s.reviewStatus === "approved");
  return (
    <>
      <PageHeader
        title={s.slug}
        description={`${s.displayName}${s.owner ? `. Owner: ${s.owner}` : ""}. Data classification: ${classificationWord(s.dataClassification)}.`}
        infoHref="/docs/mcp-servers"
        actions={
          <>
            <KindBadge scope={s.scope} /> <StatusIndicator view={reviewStatusView(s)} />
            <Button
              disabledReason={write}
              disabled={act.isPending}
              onClick={() => act.mutate({ what: "refresh" })}
            >
              Refresh inventory
            </Button>
            <ActionsMenu
              actions={[
                {
                  id: "publish",
                  label: "Publish",
                  onSelect: () => setConfirm("publish"),
                  disabledReason:
                    write ??
                    (canPublish
                      ? undefined
                      : enterprise
                        ? "Already published or not publishable"
                        : "Team servers are approved, not published"),
                },
                {
                  id: "retire",
                  label: "Retire",
                  onSelect: () => setConfirm("retire"),
                  disabledReason: write ?? (s.published ? undefined : "Not published"),
                },
                s.reviewStatus === "suspended"
                  ? {
                      id: "resume",
                      label: "Resume",
                      onSelect: () => setConfirm("resume"),
                      disabledReason: suspendReason,
                    }
                  : {
                      id: "suspend",
                      label: "Suspend",
                      onSelect: () => setConfirm("suspend"),
                      disabledReason: suspendReason,
                    },
                {
                  id: "delete",
                  label: "Delete",
                  onSelect: () => setConfirm("delete"),
                  disabledReason: write ?? (s.published ? "Retire the server first" : undefined),
                },
              ]}
            />
          </>
        }
      />
      <ErrorAlert errors={[act.error]} title="The change was not made" />
      {confirm === "publish" && (
        <ConfirmDialog
          title={`Publish ${s.slug}`}
          confirmLabel="Publish"
          withNote={{ label: "Note (optional)" }}
          onConfirm={(note) => act.mutate({ what: "publish", note })}
          onCancel={() => setConfirm(undefined)}
        >
          <p>Every team sees it in its catalog, switched off, and may switch it on.</p>
          <CliPreview command={publishMcpServerCli(s.id)} />
        </ConfirmDialog>
      )}
      {confirm === "retire" && (
        <ConfirmDialog
          title={`Retire ${s.slug}`}
          confirmLabel="Retire"
          withNote={{ label: "Note (optional)" }}
          onConfirm={(note) => act.mutate({ what: "retire", note })}
          onCancel={() => setConfirm(undefined)}
        >
          <p>Teams can no longer switch it on; calls from teams that use it are refused.</p>
        </ConfirmDialog>
      )}
      {(confirm === "suspend" || confirm === "resume") && (
        <ConfirmDialog
          title={`${confirm === "suspend" ? "Suspend" : "Resume"} ${s.slug}`}
          confirmLabel={confirm === "suspend" ? "Suspend" : "Resume"}
          withNote={{ label: "Reason (recorded in the audit log)", required: true }}
          onConfirm={(note) => act.mutate({ what: confirm, note })}
          onCancel={() => setConfirm(undefined)}
        >
          <p>
            {confirm === "suspend"
              ? "Every call to this server is refused for every team at once (server_suspended)."
              : "Calls flow again for the teams that switched it on."}
          </p>
          <CliPreview command={suspendMcpServerCli(s.id, confirm === "suspend", "<reason>")} />
        </ConfirmDialog>
      )}
      {confirm === "delete" && (
        <ConfirmDialog
          title={`Delete ${s.slug}`}
          confirmLabel="Delete"
          onConfirm={() => act.mutate({ what: "delete" })}
          onCancel={() => setConfirm(undefined)}
        >
          <p>The API refuses to delete a server that a team still uses.</p>
        </ConfirmDialog>
      )}
    </>
  );
}

function Overview({ s }: { s: McpServerRecord }) {
  const uc = useService("mcpCatalog");
  const me = useMe();
  const qc = useQueryClient();
  const write = gate(me, "mcp-servers:write");
  const toggle = useMutation({
    mutationFn: (on: boolean) => uc.update(s, { defaultForNewTeams: on }),
    onSettled: () => void qc.invalidateQueries({ queryKey: areaKey(AREA) }),
  });
  return (
    <>
      <Card title="Server">
        <KeyValue
          items={[
            { label: "Slug", value: <code>{s.slug}</code> },
            { label: "Kind", value: <KindBadge scope={s.scope} /> },
            { label: "Purpose", value: s.purpose ?? "—" },
            {
              label: "Documentation",
              value: s.docUrl ? (
                <a href={s.docUrl} target="_blank" rel="noreferrer noopener">
                  {s.docUrl}
                </a>
              ) : (
                "—"
              ),
            },
            { label: "Transport", value: transportWord(s.transport, s.location) },
            {
              label: s.transport === "hosted" ? "Image" : "URL",
              value: <code>{s.transport === "hosted" ? s.hosted?.imageDigest : s.url}</code>,
            },
            { label: "Protocol version", value: s.protocolVersion ?? "Not detected yet" },
            { label: "Authentication", value: mcpAuthWord(s.authKind) },
            {
              label: "Credential",
              value: <StatusIndicator view={mcpCredentialView(s.credentialState, s.authKind)} />,
            },
            {
              label: "Drift policy",
              value: s.driftPolicy === "hold" ? "Hold" : "Approve compatible changes",
            },
            { label: "Risk", value: <RiskStatus tier={s.riskTier} /> },
            { label: "Created", value: `${formatLocal(s.createdAt)} by ${s.createdBy}` },
          ]}
        />
        {s.scope === "enterprise" && (
          <p>
            <Switch
              label="Switch on for new teams by default"
              checked={s.defaultForNewTeams === true}
              busy={toggle.isPending}
              disabledReason={write}
              onChange={(on) => toggle.mutate(on)}
              showLabel
            />
          </p>
        )}
        <ErrorAlert errors={[toggle.error]} />
      </Card>
      <Card title="Automatic checks">
        <ChecksList checks={s.checks ?? []} />
      </Card>
    </>
  );
}

/** The inventory and the held change of the selected primitive (AC-2.2 to AC-2.4). */
function Inventory({ s }: { s: McpServerRecord }) {
  const uc = useService("mcpCatalog");
  const me = useMe();
  const prims = useQuery({
    queryKey: primitivesKey(s.id),
    queryFn: ({ signal }) => uc.primitives(s.id, signal),
  });
  const items = prims.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const sel = items.find((p) => p.id === selected[0]);
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <div style={{ flex: "1.5 1 420px", minWidth: 0 }}>
        <Card title={`Inventory (${items.length})`}>
          <p>
            Pinned definitions. A changed or new definition is held until approved (drift policy:{" "}
            <b>{s.driftPolicy === "hold" ? "Hold" : "Approve compatible"}</b>).
          </p>
          <ErrorAlert errors={[prims.error]} />
          <Table
            id="mcp-inventory"
            caption="Tools, resources and prompts"
            filterLabel="Find tools, resources, prompts"
            status={prims.isPending ? "loading" : prims.isError ? "error" : "ready"}
            emptyText="No inventory yet. Refresh the inventory once the server is reachable."
            items={items}
            getRowId={(p) => p.id}
            selection={{ mode: "single", selected, onChange: setSelected }}
            propertyFilters={[
              {
                id: "status",
                label: "Status",
                options: [
                  { value: "approved", label: "Allowed" },
                  { value: "pending_review", label: "Held" },
                  { value: "blocked", label: "Blocked" },
                ],
                match: (p, v) => p.status === v,
              },
            ]}
            columns={[
              ...primitiveColumns<McpPrimitiveRecord>(),
              {
                id: "status",
                header: "Status",
                text: (p) => primitiveStatusView(p).word,
                cell: (p) => <StatusIndicator view={primitiveStatusView(p)} />,
              },
            ]}
          />
        </Card>
      </div>
      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
        {sel?.status === "pending_review" ? (
          <HeldChange s={s} p={sel} reviewReason={gate(me, "mcp-servers:review")} />
        ) : (
          <Card title="Held changes">
            <p>Select a held primitive to see what changed and decide it.</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function HeldChange({
  s,
  p,
  reviewReason,
}: {
  s: McpServerRecord;
  p: McpPrimitiveRecord;
  reviewReason: string | undefined;
}) {
  const uc = useService("mcpCatalog");
  const qc = useQueryClient();
  const [deciding, setDeciding] = useState<"approve" | "reject">();
  const change = useQuery({
    queryKey: [...primitivesKey(s.id), "change", p.id],
    queryFn: ({ signal }) => uc.change(s.id, p.id, signal),
  });
  const decide = useMutation({
    mutationFn: ({ d, note }: { d: "approve" | "reject"; note?: string | undefined }) =>
      change.data
        ? uc.decidePrimitive(s.id, change.data, d, note)
        : Promise.reject(new Error("no change")),
    onSettled: () => {
      setDeciding(undefined);
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
    },
  });
  const c = change.data;
  const failed = c?.checks.some((x) => x.outcome === "fail") === true;
  return (
    <Card title={`Definition ${p.change === "new" ? "added" : "changed"}: ${p.name}`}>
      <ErrorAlert errors={[change.error, decide.error]} />
      {c && (
        <>
          <DiffView
            before={JSON.stringify(c.approvedDefinition ?? {}, null, 2)}
            after={JSON.stringify(c.pendingDefinition, null, 2)}
          />
          {failed && (
            <Alert kind="error" title="An automatic check failed">
              Treat this as possible tool poisoning. Approving needs an override note.
            </Alert>
          )}
          {c.crossesRiskLine && (
            <Alert kind="warning" title="Crosses a risk line">
              The change raises the server's risk; teams with this server on are told.
            </Alert>
          )}
          <ChecksList checks={c.checks} />
          <KeyValue
            items={[
              {
                label: "While held",
                value: p.approvedDigest
                  ? `Agents keep the approved definition (${p.approvedDigest.slice(0, 15)}…) and can still call it.`
                  : "Not callable until approved.",
              },
            ]}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button disabledReason={reviewReason} onClick={() => setDeciding("reject")}>
              Reject and keep old
            </Button>
            <Button
              variant="primary"
              disabledReason={reviewReason}
              onClick={() => setDeciding("approve")}
            >
              Approve
            </Button>
          </div>
        </>
      )}
      {deciding && (
        <ConfirmDialog
          title={`${deciding === "approve" ? "Approve" : "Reject"} ${p.name}`}
          confirmLabel={deciding === "approve" ? "Approve" : "Reject"}
          withNote={{
            label:
              deciding === "approve" && failed
                ? "Override note (a check failed)"
                : "Note (optional)",
            required: deciding === "approve" && failed,
          }}
          onConfirm={(note) => decide.mutate({ d: deciding, note })}
          onCancel={() => setDeciding(undefined)}
        />
      )}
    </Card>
  );
}

function ServicePolicy({ s }: { s: McpServerRecord }) {
  const uc = useService("mcpCatalog");
  const me = useMe();
  const qc = useQueryClient();
  return (
    <PolicyEditor
      title="Service policy"
      intro="Rules for every team. A team's own rules and an agent's blocks can only narrow these. Saving replaces the stored rules."
      reason={gate(me, "mcp-servers:write")}
      save={(rules) => uc.putPolicy(s.id, rules)}
      cliFor={(rules) => putMcpPolicyCli(s.id, rules)}
      onSaved={() => void qc.invalidateQueries({ queryKey: primitivesKey(s.id) })}
    />
  );
}

function Credentials({ s }: { s: McpServerRecord }) {
  const uc = useService("mcpCatalog");
  const me = useMe();
  const qc = useQueryClient();
  const write = gate(me, "mcp-servers:write");
  const [scope, setScope] = useState(s.credentialMode === "shared" ? "shared" : "");
  const [open, setOpen] = useState(false);
  const secretKind = usesSecretValue(s.authKind);
  return (
    <Card title="Credentials">
      <KeyValue
        items={[
          { label: "Authentication", value: mcpAuthWord(s.authKind) },
          {
            label: "Credential mode",
            value: s.credentialMode === "shared" ? "One shared credential" : "One per team",
          },
          {
            label: "State",
            value: <StatusIndicator view={mcpCredentialView(s.credentialState, s.authKind)} />,
          },
        ]}
      />
      {!secretKind ? (
        <p>
          {s.authKind === "oauth_user"
            ? "Each team connects a service account with Connect on its MCP servers page; the gateway holds the refresh token."
            : "Nothing is stored: the gateway mints or signs a credential for each call."}
        </p>
      ) : (
        <>
          {s.credentialMode !== "shared" && (
            <FormField
              label="Team id"
              hint="Per-team credentials are set for one team, or by the team itself"
            >
              <TextInput value={scope} onChange={(e) => setScope(e.target.value.trim())} />
            </FormField>
          )}
          <Button
            variant="primary"
            disabledReason={write ?? (scope ? undefined : "Enter the team id")}
            onClick={() => setOpen(true)}
          >
            Set credential
          </Button>
        </>
      )}
      {open && (
        <CredentialDialog
          title={`Set credential · ${s.slug} · ${scope}`}
          authKind={s.authKind}
          cli={putMcpServerCredentialCli(s.id, scope, s.authKind)}
          save={(c) => uc.setCredential(s.id, scope, c)}
          onSaved={() => void qc.invalidateQueries({ queryKey: areaKey(AREA) })}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  );
}

function Teams({ s }: { s: McpServerRecord }) {
  return (
    <Card title="Teams">
      <KeyValue
        items={[
          { label: "Teams with it on", value: num(s.adoption?.teams) },
          { label: "Agents with access", value: num(s.adoption?.agents) },
          {
            label: "Who can switch it on",
            value:
              s.scope === "team"
                ? `Only ${s.teamId ?? "its team"}`
                : s.published
                  ? "Every team, in full or read-only mode"
                  : "No team until it is published",
          },
        ]}
      />
      <p>
        Per-team adoption is in the <Link to="/reports/mcp?view=adoption">MCP report</Link>.
      </p>
    </Card>
  );
}

function Usage({ s }: { s: McpServerRecord }) {
  const usage = useOptionalService("mcpUsage");
  const me = useMe();
  const q = useQuery({
    queryKey: usageKey("service", { view: "usage", groupBy: "server" }),
    queryFn: ({ signal }) =>
      usage
        ? usage.run({ level: "service" }, { view: "usage", groupBy: "server" }, signal)
        : Promise.reject(new Error("no usage service")),
    enabled: usage !== undefined && can(me, "mcp-events:read"),
    retry: false,
  });
  const row = q.data?.rows.find((r) => r.key === s.id || r.label === s.slug);
  const t = row ? McpUsageUseCases.totals([row]) : undefined;
  return (
    <Card title="Usage">
      <ErrorAlert errors={[q.error]} />
      {!can(me, "mcp-events:read") ? (
        <p>Requires MCP usage access.</p>
      ) : (
        <KeyValue
          items={[
            { label: "Calls", value: t ? num(t.calls) : "No calls in the report's range" },
            { label: "Tool errors", value: t ? pct(t.errors, t.calls) : "—" },
            { label: "Refused by AFS", value: t ? num(t.refusals) : "—" },
            { label: "p95 latency", value: ms(row?.p95Ms) },
          ]}
        />
      )}
      <p>
        <Link to="/reports/mcp">Open the MCP report</Link>
      </p>
    </Card>
  );
}
