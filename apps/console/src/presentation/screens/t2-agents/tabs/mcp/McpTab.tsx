import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../../../application/errors.js";
import type { TeamMcpServerRecord } from "../../../../../application/ports/mcp.js";
import { mcpSpecOf } from "../../../../../application/usecases/mcp/McpUseCases.js";
import {
  type AgentMcpSpec,
  MCP_CONFIG_FILE,
  type McpServerChoice,
  mcpEnvPreview,
  mcpReasonWord,
  modeWord,
  updateAgentMcpCli,
  validateAgentMcp,
} from "../../../../../domain/mcp.js";
import { can } from "../../../../../domain/me.js";
import { renderEnv } from "../../../../../domain/modelEndpoints.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  FormField,
  SelectInput,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { areaKey, queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";
import { ErrorAlert, KindBadge, teamServersKey } from "../../../sm-mcp/shared.js";
import { agentsKey } from "../../keys.js";
import type { PanelTabProps } from "../../panelTabs.js";

const MODES = [
  {
    value: "search",
    label: "Search (recommended)",
    hint: "The agent sees three tools: afs_search, afs_describe, afs_call. Small, stable context; works with any MCP client.",
  },
  {
    value: "full",
    label: "Full listing",
    hint: "The agent sees every allowed tool, prefixed by server. Use when the runtime or model provider does its own tool search.",
  },
] as const;

/**
 * TM4 (screen 52, MCP-WEB-3): the agent's servers (all team servers or a selection), its blocks, the discovery
 * mode, what it receives, and its effective tools with the level that decided each. Saved through `UpdateAgent`
 * `mcp` with `If-Match`; no MCP credential reaches the pod.
 */
export function McpTab({ teamId, agent }: PanelTabProps) {
  const teamMcp = useService("teamMcp");
  const uc = useService("agentMcp");
  const me = useMe();
  const qc = useQueryClient();
  const reason = useTeamWriteGate(teamId).reasonFor("agents:write");
  const initial = mcpSpecOf(agent);
  const [spec, setSpec] = useState<AgentMcpSpec>(initial);
  const [blockServer, setBlockServer] = useState("");
  const [blockName, setBlockName] = useState("");
  const servers = useQuery({
    queryKey: teamServersKey(teamId),
    queryFn: ({ signal }) => teamMcp.servers(teamId, signal),
  });
  const effective = useQuery({
    queryKey: queryKey({ area: "mcp", teamId, resource: "effective", id: agent.id }),
    queryFn: ({ signal }) => teamMcp.effective(teamId, agent.id, signal),
    enabled: can(me, "team-mcp-servers:read", teamId),
  });
  const on: TeamMcpServerRecord[] = [
    ...(servers.data?.enterprise ?? []),
    ...(servers.data?.team ?? []),
  ].filter((t) => t.enabled && t.state === "on");
  const team: McpServerChoice[] = on.map((t) => ({ id: t.server.id, slug: t.server.slug }));
  const errors = validateAgentMcp(spec, team);
  const save = useMutation({
    mutationFn: () => uc.save(teamId, agent, spec, team),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: agentsKey(teamId) });
      void qc.invalidateQueries({ queryKey: areaKey("agents", teamId) });
      void qc.invalidateQueries({ queryKey: areaKey("mcp", teamId) });
    },
  });
  const apiErr = isAppError(save.error) ? save.error : undefined;
  const stale = apiErr?.kind === "stale";
  const selected = (id: string) => spec.access === "all" || spec.serverIds.includes(id);
  const env = mcpEnvPreview(spec, team, agent.models.env?.AFS_GATEWAY_URL);
  const changed = JSON.stringify(spec) !== JSON.stringify(initial);
  const slugOf = (id: string) => on.find((t) => t.server.id === id)?.server.slug ?? id;
  const eff = effective.data;
  return (
    <>
      <Card title="Servers">
        <p>
          From the team's switched-on servers ({on.length}). Each level can only narrow the one
          above: service, team, then this agent.
        </p>
        <ErrorAlert errors={[servers.error]} />
        <div role="radiogroup" aria-label="MCP access">
          {(["all", "selected"] as const).map((a) => (
            <label key={a} style={{ marginRight: 12 }}>
              <input
                type="radio"
                name={`mcp-access-${agent.id}`}
                checked={spec.access === a}
                aria-disabled={reason !== undefined || undefined}
                onChange={() =>
                  reason === undefined &&
                  setSpec({
                    ...spec,
                    access: a,
                    serverIds:
                      a === "selected" && spec.serverIds.length === 0
                        ? team.map((t) => t.id)
                        : spec.serverIds,
                  })
                }
              />{" "}
              {a === "all" ? "All team servers" : "Selected servers"}
            </label>
          ))}
        </div>
        {errors.serverIds && <div role="alert">{errors.serverIds}</div>}
        <Table
          id="agent-mcp-servers"
          caption={`MCP servers of ${agent.name}`}
          status={servers.isPending ? "loading" : servers.isError ? "error" : "ready"}
          emptyText="The team has no MCP server switched on."
          items={on}
          getRowId={(t) => t.server.id}
          columns={[
            {
              id: "on",
              header: "On",
              alwaysVisible: true,
              cell: (t) => (
                <input
                  type="checkbox"
                  aria-label={`Agent may use ${t.server.slug}`}
                  checked={selected(t.server.id)}
                  aria-disabled={reason !== undefined || spec.access === "all" || undefined}
                  onChange={(x) => {
                    if (reason !== undefined || spec.access === "all") return;
                    setSpec({
                      ...spec,
                      serverIds: x.target.checked
                        ? [...spec.serverIds, t.server.id]
                        : spec.serverIds.filter((s) => s !== t.server.id),
                    });
                  }}
                />
              ),
            },
            {
              id: "server",
              header: "Server",
              alwaysVisible: true,
              cell: (t) => (
                <Link to={`/t/${teamId}/mcp-servers/${t.server.id}`}>
                  <code>{t.server.slug}</code>
                </Link>
              ),
            },
            { id: "kind", header: "Kind", cell: (t) => <KindBadge scope={t.server.scope} /> },
            { id: "mode", header: "Team mode", cell: (t) => modeWord(t.mode) },
            {
              id: "blocks",
              header: "Agent blocks",
              cell: (t) => {
                const bs = spec.blocks.filter((b) => b.serverId === t.server.id);
                if (bs.length === 0) return "—";
                return bs.map((b) => (
                  <span key={b.name} style={{ marginRight: 4 }}>
                    <code>{b.name}</code>{" "}
                    <Button
                      variant="link"
                      aria-label={`Unblock ${b.name} on ${t.server.slug}`}
                      disabledReason={reason}
                      onClick={() =>
                        setSpec({
                          ...spec,
                          blocks: spec.blocks.filter(
                            (x) => !(x.serverId === b.serverId && x.name === b.name),
                          ),
                        })
                      }
                    >
                      ✕
                    </Button>
                  </span>
                ));
              },
            },
          ]}
        />
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <FormField label="Block a tool on">
            <SelectInput
              value={blockServer}
              placeholder="Choose a server"
              aria-disabled={reason !== undefined || undefined}
              options={on.map((t) => ({ value: t.server.id, label: t.server.slug }))}
              onChange={(e) => reason === undefined && setBlockServer(e.target.value)}
            />
          </FormField>
          <FormField label="Tool name" error={errors.blocks}>
            <TextInput
              value={blockName}
              readOnly={reason !== undefined}
              onChange={(e) => setBlockName(e.target.value)}
            />
          </FormField>
          <Button
            disabledReason={
              reason ?? (blockServer && blockName.trim() ? undefined : "Choose a server and a tool")
            }
            onClick={() => {
              setSpec({
                ...spec,
                blocks: [...spec.blocks, { serverId: blockServer, name: blockName.trim() }],
              });
              setBlockName("");
            }}
          >
            Add block
          </Button>
        </div>
      </Card>
      <Card title="Discovery">
        <div role="radiogroup" aria-label="Discovery mode">
          {MODES.map((m) => (
            <label key={m.value} style={{ display: "block", margin: "8px 0" }}>
              <input
                type="radio"
                name={`mcp-mode-${agent.id}`}
                checked={spec.mode === m.value}
                aria-disabled={reason !== undefined || undefined}
                onChange={() => reason === undefined && setSpec({ ...spec, mode: m.value })}
              />{" "}
              <b>{m.label}</b>
              <span style={{ display: "block", marginLeft: 24 }}>{m.hint}</span>
            </label>
          ))}
        </div>
      </Card>
      <Card title="What the agent receives">
        <section aria-label="MCP environment preview">
          <pre>
            <code>
              {env.length > 0
                ? `${renderEnv(env)}\n${MCP_CONFIG_FILE}  (mcpServers block for MCP hosts)`
                : "Nothing: the agent has no MCP server."}
            </code>
          </pre>
        </section>
        <p>
          No MCP credential reaches the pod. Changing servers here rolls the pod; the gateway
          enforces changes at once.
        </p>
      </Card>
      <Card title="Effective tools">
        <ErrorAlert errors={[effective.error]} />
        {eff ? (
          eff.servers.length === 0 ? (
            <p>No effective server yet.</p>
          ) : (
            <>
              <p>
                {eff.servers
                  .map((s) => {
                    const allowed = s.primitives.filter((p) => p.allowed).length;
                    return `${s.slug} ${allowed} of ${s.primitives.length}`;
                  })
                  .join(" · ")}
              </p>
              <details>
                <summary>Show effective tools and which level decided each</summary>
                <Table
                  id="agent-mcp-effective"
                  caption="Effective tools, resources and prompts"
                  filterLabel="Find tools"
                  items={eff.servers.flatMap((s) =>
                    s.primitives.map((p) => ({ ...p, slug: s.slug, key: `${s.slug}/${p.name}` })),
                  )}
                  getRowId={(p) => p.key}
                  columns={[
                    {
                      id: "name",
                      header: "Name",
                      alwaysVisible: true,
                      sortValue: (p) => p.key,
                      cell: (p) => (
                        <code>
                          {p.slug}__{p.name}
                        </code>
                      ),
                    },
                    { id: "kind", header: "Kind", cell: (p) => p.kind },
                    {
                      id: "allowed",
                      header: "Allowed",
                      cell: (p) => (p.allowed ? "Yes" : mcpReasonWord(p.reason)),
                    },
                    { id: "level", header: "Decided by", cell: (p) => p.level ?? "—" },
                    {
                      id: "rate",
                      header: "Rate limit",
                      cell: (p) => (p.rateLimitPerMinute ? `${p.rateLimitPerMinute} / min` : "—"),
                    },
                  ]}
                />
              </details>
            </>
          )
        ) : (
          <p>Shown once the agent's MCP settings are applied.</p>
        )}
      </Card>
      {stale && (
        <Alert kind="warning" title="The agent changed">
          Someone else changed this agent. Reload it and make your change again.
        </Alert>
      )}
      {apiErr && !stale && <ErrorAlert errors={[apiErr]} title="The MCP settings were not saved" />}
      <Button
        variant="primary"
        disabled={save.isPending}
        disabledReason={
          reason ??
          (!changed
            ? "Nothing changed"
            : Object.keys(errors).length > 0
              ? "Fix the settings first"
              : undefined)
        }
        onClick={() => save.mutate()}
      >
        Save changes
      </Button>
      <CliPreview command={updateAgentMcpCli(teamId, agent.id, spec)} />
      <p>
        Blocked here:{" "}
        {spec.blocks.map((b) => `${slugOf(b.serverId)} · ${b.name}`).join(", ") || "none"}.
      </p>
    </>
  );
}
