import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  classificationWord,
  createMcpServerCli,
  emptyMcpDraft,
  type McpServerDraft,
  mcpAuthWord,
  SERVICE_MCP_STEPS,
  STEP_FIELDS,
  stepErrors,
  transportWord,
  validateMcpServer,
} from "../../../domain/mcp.js";
import {
  Alert,
  Breadcrumbs,
  CliPreview,
  KeyValue,
  PageHeader,
  Wizard,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { type McpFieldsPart, McpServerFields } from "./McpServerFields.js";
import { AREA, catalogKey, ErrorAlert } from "./shared.js";

const PARTS: readonly McpFieldsPart[] = ["details", "connection", "policy", "availability"];

/** SM2 (screen 48, MCP-WEB-1): *Add enterprise server*. It is created as a draft; review and publish follow. */
export function AddMcpServerPage() {
  const uc = useService("mcpCatalog");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<McpServerDraft>(emptyMcpDraft("enterprise"));
  const catalog = useQuery({ queryKey: catalogKey, queryFn: ({ signal }) => uc.catalog(signal) });
  const taken = [...(catalog.data?.enterprise ?? []), ...(catalog.data?.team ?? [])].map(
    (s) => s.slug,
  );
  const errors = validateMcpServer(draft, "enterprise", taken);
  const create = useMutation({
    mutationFn: async () => {
      const s = await uc.create(draft, taken);
      return draft.defaultForNewTeams ? uc.update(s, { defaultForNewTeams: true }) : s;
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      navigate(`/mcp-servers/${s.id}`);
    },
  });
  const apiErr = isAppError(create.error) ? create.error : undefined;
  const denied = gate(me, "mcp-servers:write");
  const shown = { ...errors, ...(apiErr?.fields ?? {}) };
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "MCP servers", to: "/mcp-servers" },
          { label: "Add enterprise server" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Add enterprise server"
        description="An MCP server every team can switch on. It is created as a draft; AFS lists and pins its tools, then you publish it."
        infoHref="/docs/mcp-servers"
      />
      {denied && (
        <Alert kind="info" title={denied}>
          Only a service admin adds enterprise MCP servers.
        </Alert>
      )}
      <ErrorAlert
        errors={[apiErr && Object.keys(apiErr.fields).length === 0 ? apiErr : undefined]}
      />
      <Wizard
        steps={PARTS.map((part, i) => {
          const title = SERVICE_MCP_STEPS[i] ?? part;
          return {
            id: part,
            title,
            valid: Object.keys(stepErrors(title, errors)).length === 0,
            content: (
              <McpServerFields
                scope="enterprise"
                part={part}
                draft={draft}
                errors={STEP_FIELDS[title] ? stepErrors(title, shown) : {}}
                onChange={setDraft}
              />
            ),
          };
        })}
        review={
          <>
            <KeyValue
              items={[
                { label: "Slug", value: <code>{draft.slug}</code> },
                { label: "Display name", value: draft.displayName },
                { label: "Owner", value: draft.owner || "—" },
                {
                  label: "Data classification",
                  value: classificationWord(draft.dataClassification),
                },
                {
                  label: "Transport",
                  value: transportWord(
                    draft.transport,
                    draft.transport === "hosted" ? "in_namespace" : draft.location,
                  ),
                },
                {
                  label: draft.transport === "hosted" ? "Image" : "URL",
                  value: (
                    <code>{draft.transport === "hosted" ? draft.imageDigest : draft.url}</code>
                  ),
                },
                { label: "Authentication", value: mcpAuthWord(draft.authKind) },
                {
                  label: "Drift policy",
                  value: draft.driftPolicy === "hold" ? "Hold" : "Approve compatible changes",
                },
                { label: "On for new teams", value: draft.defaultForNewTeams ? "Yes" : "No" },
              ]}
            />
            <Alert kind="info" title="Created as a draft">
              Teams do not see the server until you publish it from its page.
            </Alert>
            <CliPreview command={createMcpServerCli(draft)} />
          </>
        }
        submitLabel={create.isPending ? "Creating…" : "Create draft"}
        onSubmit={() => {
          if (denied === undefined && Object.keys(errors).length === 0) create.mutate();
        }}
        onCancel={() => navigate("/mcp-servers")}
      />
    </div>
  );
}
