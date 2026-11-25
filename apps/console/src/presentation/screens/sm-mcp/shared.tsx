// Pieces shared by the MCP screens (SM1..SM5, TM1..TM5, VM1): badges, query keys and small tables.
import { useQuery } from "@tanstack/react-query";
import type { McpCheckRecord, McpPrimitiveRecord } from "../../../application/ports/mcp.js";
import {
  ANNOTATION_WORDS,
  annotationClasses,
  checkName,
  checkView,
  kindWord,
  primitiveKindWord,
  riskView,
} from "../../../domain/mcp.js";
import { can } from "../../../domain/me.js";
import { Badge, StatusIndicator, Table, type TableColumn } from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

export { ErrorAlert } from "../sg-model-endpoints/shared.js";

export const AREA = "mcp";
/** The S10 settings list; the *Settings* tab uses the same key. */
export const SETTINGS_KEY = queryKey({ area: "settings", resource: "settings" });
export const catalogKey = queryKey({ area: AREA, resource: "catalog" });
export const reviewsKey = queryKey({ area: AREA, resource: "reviews" });
export const captureKey = queryKey({ area: AREA, resource: "query-capture" });
export const serverKey = (id: string) => queryKey({ area: AREA, resource: "server", id });
export const primitivesKey = (id: string) => queryKey({ area: AREA, resource: "primitives", id });
export const teamServersKey = (teamId: string) =>
  queryKey({ area: AREA, teamId, resource: "servers" });
export const teamServerKey = (teamId: string, id: string) =>
  queryKey({ area: AREA, teamId, resource: "server", id });
export const usageKey = (scope: string, params: Readonly<Record<string, unknown>>) =>
  queryKey({ area: AREA, resource: "usage", id: scope, params });

/** *Enterprise* (blue) or *Team-managed* (teal), as every MCP screen labels a server. */
export function KindBadge({ scope }: { scope: string }) {
  return <Badge tone={scope === "team" ? "teal" : "blue"}>{kindWord(scope)}</Badge>;
}

/** The risk tier as dot and word; `—` for enterprise servers. */
export function RiskStatus({ tier }: { tier: string | null | undefined }) {
  return <StatusIndicator view={riskView(tier)} />;
}

/** `read-only`, `destructive`, `open-world` badges from a primitive's annotations; `none` when absent. */
export function Annotations({ a }: { a: McpPrimitiveRecord["annotations"] }) {
  const classes = annotationClasses(a);
  if (classes.length === 0) return <span>none</span>;
  return (
    <>
      {classes.map((c) => (
        <span key={c} style={{ marginRight: 4 }}>
          <Badge tone={c === "destructive" ? "amber" : c === "open_world" ? "grey" : "blue"}>
            {ANNOTATION_WORDS[c]}
          </Badge>
        </span>
      ))}
    </>
  );
}

/** The automatic checks of a server or a held change (screens 47, 49, 51). */
export function ChecksList({ checks }: { checks: readonly McpCheckRecord[] }) {
  if (checks.length === 0) return <p>No checks have run yet.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }} aria-label="Automatic checks">
      {checks.map((c) => (
        <li
          key={c.name}
          style={{
            display: "flex",
            gap: 12,
            padding: "6px 0",
            borderBottom: "1px solid var(--soft)",
          }}
        >
          <StatusIndicator view={checkView(c.outcome)} />
          <span>
            {checkName(c.name)}
            {c.detail ? `: ${c.detail}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Name and kind columns every inventory table starts with. */
export function primitiveColumns<T extends McpPrimitiveRecord>(): TableColumn<T>[] {
  return [
    {
      id: "name",
      header: "Name",
      alwaysVisible: true,
      sortValue: (p) => p.name,
      cell: (p) => <code>{p.name}</code>,
    },
    { id: "kind", header: "Kind", cell: (p) => primitiveKindWord(p.kind), text: (p) => p.kind },
    {
      id: "annotations",
      header: "Annotations",
      cell: (p) => <Annotations a={p.annotations} />,
      text: (p) => annotationClasses(p.annotations).join(" "),
    },
  ];
}

/** A plain inventory table (screens 49, 51): name, kind, annotations and a decision column. */
export function InventoryTable({
  id,
  items,
  status,
  decision,
}: {
  id: string;
  items: readonly McpPrimitiveRecord[];
  status: "loading" | "ready" | "error";
  decision: TableColumn<McpPrimitiveRecord>;
}) {
  return (
    <Table
      id={id}
      caption={`Inventory (${items.length})`}
      filterLabel="Find tools, resources, prompts"
      status={status}
      emptyText="No tools, resources or prompts yet. Refresh the inventory once the server is reachable."
      items={items}
      getRowId={(p) => p.id}
      columns={[...primitiveColumns(), decision]}
    />
  );
}

/** The service approval policy (`mcp.team_server_approval`), when the caller may read settings. */
export function useApprovalPolicy(): string | undefined {
  const settings = useOptionalService("settings");
  const me = useMe();
  const q = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: ({ signal }) =>
      settings ? settings.list(signal) : Promise.reject(new Error("no settings service")),
    enabled: settings !== undefined && can(me, "admin:settings"),
    retry: false,
  });
  const v = q.data?.find((s) => s.key === "mcp.team_server_approval")?.value;
  return typeof v === "string" ? v : undefined;
}

/** `412,880` */
export const num = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US");
