// The fields of the MCP server wizards (screens 48 and 51). Controlled; no field holds a credential value: the
// credential is set after create, on the server's detail (service) or the team's server page.
import {
  AUTH_HINTS,
  classificationWord,
  type McpAuthKind,
  type McpDraftErrors,
  type McpScope,
  type McpServerDraft,
  mcpAuthWord,
} from "../../../domain/mcp.js";
import { FormField, SelectInput, Switch, TextInput } from "../../components/index.js";

export type McpFieldsPart = "details" | "connection" | "policy" | "availability";

const AUTH_KINDS: readonly McpAuthKind[] = [
  "none",
  "static",
  "oauth_client",
  "workload_federation",
  "oauth_user",
  "aws_sigv4",
];
const CLASSIFICATIONS = ["public", "internal", "confidential", "restricted"];

/** A radio group of tiles with a word and its consequence (AWS console "tiles"). */
function Tiles<V extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  value: V;
  options: readonly { value: V; label: string; hint: string }[];
  onChange: (v: V) => void;
  error?: string | undefined;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: "0 0 16px" }}>
      <legend style={{ fontWeight: 700, marginBottom: 8 }}>{legend}</legend>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 8,
        }}
      >
        {options.map((o) => (
          <label
            key={o.value}
            style={{
              border: `2px solid ${value === o.value ? "var(--blue)" : "var(--line)"}`,
              borderRadius: 8,
              padding: 12,
              display: "block",
            }}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />{" "}
            <b>{o.label}</b>
            <span style={{ display: "block", fontSize: 13 }}>{o.hint}</span>
          </label>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}

export function McpServerFields({
  scope,
  part,
  draft,
  errors,
  onChange,
}: {
  scope: McpScope;
  part: McpFieldsPart;
  draft: McpServerDraft;
  errors: McpDraftErrors;
  onChange: (d: McpServerDraft) => void;
}) {
  const set = <K extends keyof McpServerDraft>(k: K, v: McpServerDraft[K]) =>
    onChange({ ...draft, [k]: v });
  if (part === "details")
    return (
      <>
        <FormField
          label="Slug"
          hint="What agents call: AFS_MCP_<SLUG>_URL and the prefix of each tool name. Lowercase letters, digits and hyphens."
          error={errors.slug}
        >
          <TextInput value={draft.slug} onChange={(e) => set("slug", e.target.value)} />
        </FormField>
        <FormField label="Display name" error={errors.displayName}>
          <TextInput
            value={draft.displayName}
            onChange={(e) => set("displayName", e.target.value)}
          />
        </FormField>
        <FormField
          label={scope === "team" ? "Owner" : "Owner (optional)"}
          hint="The person or group answerable for the server"
          error={errors.owner}
        >
          <TextInput value={draft.owner} onChange={(e) => set("owner", e.target.value)} />
        </FormField>
        <FormField
          label={scope === "team" ? "Purpose" : "Purpose (optional)"}
          hint="What agents use it for; reviewers read this"
          error={errors.purpose}
        >
          <TextInput value={draft.purpose} onChange={(e) => set("purpose", e.target.value)} />
        </FormField>
        <FormField label="Documentation link (optional)" error={errors.docUrl}>
          <TextInput value={draft.docUrl} onChange={(e) => set("docUrl", e.target.value)} />
        </FormField>
        <FormField
          label="Data classification"
          hint="Compared with the team's ceiling by the automatic checks"
        >
          <SelectInput
            value={draft.dataClassification}
            options={CLASSIFICATIONS.map((c) => ({ value: c, label: classificationWord(c) }))}
            onChange={(e) =>
              set("dataClassification", e.target.value as McpServerDraft["dataClassification"])
            }
          />
        </FormField>
      </>
    );
  if (part === "connection")
    return (
      <>
        <Tiles
          legend="Transport"
          name="mcp-transport"
          value={draft.transport}
          onChange={(v) => set("transport", v)}
          options={[
            {
              value: "streamable_http",
              label: "Remote server (Streamable HTTP)",
              hint: "The team gateway connects to a URL. Its host is added to the gateway's egress only, never to agents'.",
            },
            {
              value: "hosted",
              label: "Hosted by AFS",
              hint: "Runs in each team namespace from a pinned, signed OCI image. stdio servers get a bridge sidecar.",
            },
          ]}
        />
        {draft.transport === "streamable_http" ? (
          <>
            <FormField
              label="Location"
              hint="External: on the internet. Corporate: inside the enterprise network. In namespace: a Service in the team's namespace."
            >
              <SelectInput
                value={draft.location}
                options={[
                  { value: "external", label: "External" },
                  { value: "corporate", label: "Corporate" },
                  { value: "in_namespace", label: "In namespace" },
                ]}
                onChange={(e) => set("location", e.target.value as McpServerDraft["location"])}
              />
            </FormField>
            <FormField label="Server URL" error={errors.url}>
              <TextInput value={draft.url} onChange={(e) => set("url", e.target.value)} />
            </FormField>
          </>
        ) : (
          <FormField
            label="Image"
            hint="Pinned by digest: <registry>/<image>@sha256:<64 hex>, from an allowed registry"
            error={errors.imageDigest}
          >
            <TextInput
              value={draft.imageDigest}
              onChange={(e) => set("imageDigest", e.target.value)}
            />
          </FormField>
        )}
        <Tiles
          legend="Authentication to the server"
          name="mcp-auth"
          value={draft.authKind}
          onChange={(v) => set("authKind", v)}
          error={errors.authKind}
          options={AUTH_KINDS.map((k) => ({
            value: k,
            label: mcpAuthWord(k),
            hint: AUTH_HINTS[k],
          }))}
        />
        <p>
          Agents never hold these credentials. The gateway injects or mints a token for this server
          on each call and never forwards the agent's identity.
        </p>
        {draft.authKind === "static" && (
          <FormField
            label="Header name (optional)"
            hint="Sent with the key; Authorization: Bearer when empty"
            error={errors.authHeader}
          >
            <TextInput
              value={draft.authHeader}
              onChange={(e) => set("authHeader", e.target.value)}
            />
          </FormField>
        )}
        {scope === "enterprise" &&
          (draft.authKind === "static" ||
            draft.authKind === "oauth_client" ||
            draft.authKind === "oauth_user") && (
            <FormField
              label="Client credential"
              hint="Per team: each team gets its own credential, so the server's logs and revocation are per team"
            >
              <SelectInput
                value={draft.credentialMode}
                options={[
                  { value: "per_team", label: "One per team" },
                  { value: "shared", label: "One shared credential" },
                ]}
                onChange={(e) =>
                  set("credentialMode", e.target.value as McpServerDraft["credentialMode"])
                }
              />
            </FormField>
          )}
        {draft.authKind === "workload_federation" && (
          <>
            <FormField
              label="Audience"
              hint="The audience the target IdP expects"
              error={errors.audience}
            >
              <TextInput value={draft.audience} onChange={(e) => set("audience", e.target.value)} />
            </FormField>
            <FormField label="Issuer" error={errors.issuer}>
              <TextInput value={draft.issuer} onChange={(e) => set("issuer", e.target.value)} />
            </FormField>
            <FormField label="Token endpoint" error={errors.tokenEndpoint}>
              <TextInput
                value={draft.tokenEndpoint}
                onChange={(e) => set("tokenEndpoint", e.target.value)}
              />
            </FormField>
          </>
        )}
        {(draft.authKind === "static" || draft.authKind === "oauth_client") && (
          <p>
            The {draft.authKind === "static" ? "key" : "client secret"} is write-only and is set
            after the server is created
            {scope === "enterprise" && draft.credentialMode === "per_team"
              ? ", per team when a team switches the server on"
              : ""}
            .
          </p>
        )}
      </>
    );
  if (part === "policy")
    return (
      <>
        <p>
          AFS lists the server's tools, resources and prompts once it is created and pins every
          definition. Block tools and set rate limits on the server's <b>Policy</b> tab.
        </p>
        <FormField
          label="Drift policy"
          hint="What happens when a definition changes: hold it until approved, or approve schema-compatible changes automatically"
        >
          <SelectInput
            value={draft.driftPolicy}
            options={[
              { value: "hold", label: "Hold every change for review" },
              {
                value: "auto_approve_compatible",
                label: "Approve compatible changes automatically",
              },
            ]}
            onChange={(e) => set("driftPolicy", e.target.value as McpServerDraft["driftPolicy"])}
          />
        </FormField>
        <p>
          <Switch
            label="Trust the server's annotations (read-only, destructive, open-world) for team read-only mode"
            checked={draft.trustAnnotations}
            onChange={(on) => set("trustAnnotations", on)}
            showLabel
          />
        </p>
      </>
    );
  return (
    <>
      <p>
        A published server is offered to every team, switched off; each team switches it on in full
        or read-only mode.
      </p>
      <p>
        <Switch
          label="Switch on for new teams by default"
          checked={draft.defaultForNewTeams}
          onChange={(on) => set("defaultForNewTeams", on)}
          showLabel
        />
      </p>
    </>
  );
}
