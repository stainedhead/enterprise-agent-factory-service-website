import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { SettingRecord } from "../../../application/ports/settings.js";
import { toolSettings } from "../../../application/usecases/settings/orchestrationSettings.js";
import { settingText } from "../../../application/usecases/settings/SettingsUseCases.js";
import { SERVICE_ORCHESTRATION_TABS } from "../../../domain/navigation.js";
import {
  DEFAULT_SETTING_KEYS,
  DOMAIN_SETTING_KEYS,
  EDGE_SETTING_KEYS,
  exposureLabel,
  exposureView,
  RUNTIME_TEXT,
  SWITCH_SETTING_KEYS,
  toolLabel,
} from "../../../domain/orchestration.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  FormField,
  OrchestrationMark,
  PageHeader,
  SelectInput,
  StatusIndicator,
  Table,
  Tabs,
  TextInput,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { DeniedAlert } from "../../query/DeniedAlert.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { downloadText } from "../t15-history/download.js";
import { SettingDialog } from "./SettingDialog.js";

const settingsKey = queryKey({ area: "settings", resource: "settings" });

const shown = (s: SettingRecord) =>
  s.value === null || s.value === "" ? "Not set" : settingText(s.value) || "—";

/** A table of settings with an *Edit* button each. */
function SettingsTable({ keys, caption }: { keys: readonly string[]; caption: string }) {
  const settings = useService("settings");
  const me = useMe();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: settingsKey, queryFn: ({ signal }) => settings.list(signal) });
  const [editing, setEditing] = useState<SettingRecord | undefined>();
  const denied = gate(me, "admin:settings");
  const items = keys
    .map((k) => list.data?.find((s) => s.key === k))
    .filter((s): s is SettingRecord => s !== undefined);
  return (
    <Card title={caption}>
      <Table
        id={`orch-${caption.toLowerCase().replace(/\W+/g, "-")}`}
        caption={caption}
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        error={isAppError(list.error) ? list.error.message : undefined}
        columns={[
          {
            id: "key",
            header: "Key",
            alwaysVisible: true,
            cell: (s) => <code>{s.key}</code>,
            text: (s) => s.key,
          },
          { id: "value", header: "Value", cell: shown, text: shown },
          { id: "default", header: "Default", cell: (s) => settingText(s.default) || "—" },
          { id: "allowed", header: "Allowed", cell: (s) => s.allowed },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (s) => (
              <Button
                aria-label={`Edit ${s.key}`}
                disabledReason={denied}
                onClick={() => setEditing(s)}
              >
                Edit
              </Button>
            ),
          },
        ]}
        items={items}
        getRowId={(s) => s.key}
      />
      {editing && (
        <SettingDialog
          setting={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => void qc.invalidateQueries({ queryKey: settingsKey })}
        />
      )}
    </Card>
  );
}

function EndpointsTab() {
  const orch = useService("orchestration");
  const [teamId, setTeamId] = useState("");
  const [state, setState] = useState("");
  const [tool, setTool] = useState("");
  const [exposure, setExposure] = useState("");
  const query = {
    ...(teamId.trim() && { teamId: teamId.trim() }),
    ...(state && { state }),
    ...(tool && { tool }),
    ...(exposure && { exposure }),
  };
  const q = useInfiniteQuery({
    queryKey: queryKey({
      area: "orchestration",
      resource: "endpoints",
      id: `${teamId}|${state}|${tool}|${exposure}`,
    }),
    queryFn: ({ signal, pageParam }) =>
      orch.listEndpoints({ ...query, ...(pageParam ? { nextToken: pageParam } : {}) }, signal),
    initialPageParam: "" as string,
    getNextPageParam: (last) => last.nextToken,
  });
  const csv = useMutation({
    mutationFn: async () =>
      downloadText("orchestration-endpoints.csv", await orch.endpointsCsv(query)),
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const migration = q.data?.pages[0]?.migration;
  const denied = isAppError(q.error) && q.error.isAccessDenied ? q.error : undefined;
  return (
    <Card title="Orchestration endpoints">
      {denied && <DeniedAlert error={denied} />}
      {migration && migration.state !== "complete" && (
        <Alert kind="info" title="Orchestration agents are being added to existing teams">
          {migration.teamsWithOrchestration} of {migration.teamsTotal} teams have one;{" "}
          {migration.teamsPending} are pending
          {migration.blocked.length > 0 ? `, ${migration.blocked.length} blocked` : ""}.
          {migration.blocked.length > 0 && (
            <ul>
              {migration.blocked.map((b) => (
                <li key={b.teamId}>
                  <Link to={`/t/${b.teamId}/orchestration`}>{b.teamId}</Link>: {b.reason}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      <FormField label="Team id">
        <TextInput value={teamId} onChange={(e) => setTeamId(e.target.value)} />
      </FormField>
      <FormField label="Tool">
        <SelectInput
          value={tool}
          placeholder="Any tool"
          options={[
            { value: "paperclip", label: toolLabel("paperclip") },
            { value: "buzz", label: toolLabel("buzz") },
          ]}
          onChange={(e) => setTool(e.target.value)}
        />
      </FormField>
      <FormField label="Exposure">
        <SelectInput
          value={exposure}
          placeholder="Any exposure"
          options={["private", "public"].map((v) => ({ value: v, label: exposureLabel(v) }))}
          onChange={(e) => setExposure(e.target.value)}
        />
      </FormField>
      <FormField label="State">
        <SelectInput
          value={state}
          placeholder="All states"
          options={["Ready", "Degraded", "Failed", "Pending"].map((v) => ({ value: v, label: v }))}
          onChange={(e) => setState(e.target.value)}
        />
      </FormField>
      <Button disabled={csv.isPending} onClick={() => csv.mutate()}>
        Download CSV
      </Button>
      <Table
        id="orch-endpoints"
        caption="Orchestration endpoints"
        status={q.isPending ? "loading" : q.isError ? "error" : "ready"}
        error={isAppError(q.error) && !denied ? q.error.message : undefined}
        emptyText="No team has an orchestration agent yet."
        columns={[
          {
            id: "team",
            header: "Team",
            alwaysVisible: true,
            cell: (e) => <Link to={`/t/${e.teamId}/orchestration`}>{e.slug}</Link>,
            text: (e) => e.slug,
          },
          { id: "tool", header: "Tool", cell: (e) => toolLabel(e.tool) },
          {
            id: "surface",
            header: "Surface",
            cell: (e) => (e.surface === "webUi" ? "Web UI" : "Web API"),
          },
          {
            id: "host",
            header: "Hostname",
            cell: (e) => (e.hostname ? <code>{e.hostname}</code> : "—"),
          },
          {
            id: "exposure",
            header: "Exposure",
            cell: (e) => <StatusIndicator view={exposureView(e.effective)} />,
          },
          { id: "limit", header: "Endpoint limit", cell: (e) => exposureLabel(e.limit) },
          { id: "state", header: "Team state", cell: (e) => e.teamState },
          { id: "phase", header: "Phase", cell: (e) => e.phase },
          {
            id: "last",
            header: "Last access",
            cell: (e) =>
              e.lastAccessAt ? (
                <time dateTime={e.lastAccessAt}>{formatLocal(e.lastAccessAt)}</time>
              ) : (
                "—"
              ),
          },
        ]}
        items={rows}
        getRowId={(e) => `${e.teamId}:${e.surface}`}
      />
      {q.hasNextPage && (
        <Button disabled={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
          Load more
        </Button>
      )}
    </Card>
  );
}

function ToolsTab() {
  const settings = useService("settings");
  const list = useQuery({ queryKey: settingsKey, queryFn: ({ signal }) => settings.list(signal) });
  const tools = toolSettings(list.data ?? []);
  const setting = list.data?.find((s) => s.key === "orchestration.tools");
  return (
    <>
      <Card title="Tools and runtimes">
        <p>
          Each tool maps to a runtime template that service admins manage. Teams see only the tool
          and the {RUNTIME_TEXT.toLowerCase()}, never the template.
        </p>
        <Table
          id="orch-tools"
          caption="Tools and runtimes"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          emptyText="No tools are configured."
          columns={[
            { id: "tool", header: "Tool", alwaysVisible: true, cell: (t) => toolLabel(t.tool) },
            {
              id: "enabled",
              header: "Enabled",
              cell: (t) => (
                <>
                  {t.enabled ? "Yes" : "No"}{" "}
                  {t.default && <Badge tone="orchestration">Default</Badge>}
                </>
              ),
            },
            { id: "runtime", header: "Runtime template", cell: (t) => t.templateId ?? "Not set" },
            { id: "ui", header: "Web UI", cell: (t) => (t.webUi ? "Supported" : "N/A") },
            { id: "api", header: "Web API", cell: (t) => (t.webApi ? "Supported" : "N/A") },
            { id: "reg", header: "Registration", cell: (t) => t.registration.join(", ") || "—" },
          ]}
          items={tools}
          getRowId={(t) => t.tool}
        />
      </Card>
      {setting && <SettingsEditors keys={["orchestration.tools"]} caption="Tools setting" />}
    </>
  );
}

function SettingsEditors({ keys, caption }: { keys: readonly string[]; caption: string }) {
  return <SettingsTable keys={keys} caption={caption} />;
}

function KillSwitchesTab() {
  return (
    <>
      <p>
        <OrchestrationMark /> A switch that is off turns that level off for every team within a
        minute. Teams' choices are kept.
      </p>
      <SettingsTable keys={SWITCH_SETTING_KEYS} caption="Kill switches" />
      <SettingsTable keys={DOMAIN_SETTING_KEYS} caption="Base domains" />
      <SettingsTable keys={EDGE_SETTING_KEYS} caption="Edge protection" />
    </>
  );
}

/**
 * S12 (WEB-US-57): the service-wide orchestration page. *Endpoints* lists every team's endpoint outside the
 * cluster; *Tools and runtimes*, *Defaults* and *Kill switches* edit the `orchestration.*` settings.
 */
export default function OrchestrationServicePage() {
  const { tab: tabParam } = useParams();
  const navigate = useNavigate();
  const tab = SERVICE_ORCHESTRATION_TABS.find((t) => t.id === tabParam)?.id ?? "endpoints";
  const content: Record<string, React.ReactNode> = {
    endpoints: <EndpointsTab />,
    tools: <ToolsTab />,
    defaults: (
      <>
        <SettingsTable keys={DEFAULT_SETTING_KEYS} caption="Defaults for new teams" />
        <CliPreview
          command={{
            service: "admin",
            operation: "put-setting",
            args: [
              ["key", "orchestration.default_limit"],
              ["value", "private"],
            ],
          }}
        />
      </>
    ),
    "kill-switches": <KillSwitchesTab />,
  };
  return (
    <div>
      <Breadcrumbs
        crumbs={[{ label: "Agent Factory", to: "/" }, { label: "Orchestration" }]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Orchestration"
        description="Every team's orchestration agent, the tools teams can choose and the service defaults."
        infoHref="/docs/orchestration"
      />
      <Tabs
        label="Service orchestration"
        activeId={tab}
        onChange={(id) => navigate(id === "endpoints" ? "/orchestration" : `/orchestration/${id}`)}
        tabs={SERVICE_ORCHESTRATION_TABS.map((t) => ({
          id: t.id,
          label: t.label,
          content: content[t.id] ?? null,
        }))}
      />
    </div>
  );
}
