// The fields of an endpoint create form (screens 57 and 62). Controlled; no field holds a credential value: the
// credential is set after create, on the endpoint's detail or the team's Model endpoints page.
import { useState } from "react";
import {
  authWord,
  type EndpointDraft,
  type EndpointErrors,
  type EndpointModelDraft,
  type EndpointProtocol,
  locationWord,
  pricingWord,
} from "../../../domain/modelEndpoints.js";
import { Button, FormField, SelectInput, Switch, TextInput } from "../../components/index.js";

export type Part = "endpoint" | "access" | "models";
type Scope = "service" | "team";

const PROVIDERS = [
  { value: "openai", label: "OpenAI" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "nous", label: "Nous Portal" },
  { value: "opencode", label: "OpenCode Console" },
  { value: "azure", label: "Azure" },
  { value: "google", label: "Google" },
  { value: "other", label: "Other external host" },
  { value: "internal", label: "Internal (corporate)" },
];
const PROTOCOLS: readonly { value: EndpointProtocol; label: string }[] = [
  { value: "openai_chat", label: "Chat Completions (always)" },
  { value: "openai_responses", label: "Responses" },
  { value: "openai_embeddings", label: "Embeddings" },
];
const opts = (vs: readonly string[], word: (v: string) => string) =>
  vs.map((v) => ({ value: v, label: word(v) }));

export function EndpointFields({
  scope,
  part,
  draft,
  errors,
  onChange,
}: {
  scope: Scope;
  part: Part;
  draft: EndpointDraft;
  errors: EndpointErrors;
  onChange: (d: EndpointDraft) => void;
}) {
  const set = <K extends keyof EndpointDraft>(k: K, v: EndpointDraft[K]) =>
    onChange({ ...draft, [k]: v });
  if (part === "endpoint")
    return (
      <>
        <FormField
          label="Route name"
          hint="What agents call: AFS_LLM_<ROUTE>_BASE_URL. Lowercase letters, digits and hyphens."
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
        <FormField label="Description (optional)">
          <TextInput
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </FormField>
        <FormField
          label="Location"
          hint={
            scope === "team"
              ? "In namespace: a Service in the team's namespace, for example vLLM."
              : "External: a public provider. Corporate: inside the enterprise network."
          }
          error={errors.location}
        >
          <SelectInput
            value={draft.location}
            options={opts(
              scope === "team"
                ? ["in_namespace", "corporate", "external"]
                : ["external", "corporate"],
              locationWord,
            )}
            onChange={(e) => {
              const location = e.target.value as EndpointDraft["location"];
              onChange({
                ...draft,
                location,
                ...(scope === "service" && location === "corporate" && { provider: "internal" }),
              });
            }}
          />
        </FormField>
        {scope === "service" && draft.location === "external" && (
          <FormField
            label="Provider"
            hint="Matched with its hosts by the provider policy; a disabled provider cannot be added under a new route."
          >
            <SelectInput
              value={draft.provider}
              options={PROVIDERS.filter((p) => p.value !== "internal")}
              onChange={(e) => set("provider", e.target.value)}
            />
          </FormField>
        )}
        <FormField
          label="Base URL"
          hint="The OpenAI-compatible base, ending in /v1."
          error={errors.baseUrl}
        >
          <TextInput value={draft.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} />
        </FormField>
        <fieldset>
          <legend>Protocols</legend>
          {PROTOCOLS.map((p) => (
            <label key={p.value} style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={draft.protocols.includes(p.value)}
                disabled={p.value === "openai_chat"}
                onChange={(e) =>
                  set(
                    "protocols",
                    e.target.checked
                      ? [...draft.protocols, p.value]
                      : draft.protocols.filter((x) => x !== p.value),
                  )
                }
              />{" "}
              {p.label}
            </label>
          ))}
          {errors.protocols && <div role="alert">{errors.protocols}</div>}
        </fieldset>
        {scope === "team" && (
          <>
            <FormField label="Owner" hint="Shown to service admins." error={errors.owner}>
              <TextInput value={draft.owner} onChange={(e) => set("owner", e.target.value)} />
            </FormField>
            <FormField label="Purpose" error={errors.purpose}>
              <TextInput value={draft.purpose} onChange={(e) => set("purpose", e.target.value)} />
            </FormField>
          </>
        )}
      </>
    );
  if (part === "access")
    return (
      <>
        <FormField
          label="Authentication"
          hint="The credential value is set after create. It is write-only and never reaches an agent."
        >
          <SelectInput
            value={draft.authKind}
            options={opts(
              scope === "team"
                ? ["none", "bearer", "header"]
                : ["bearer", "header", "azure_federated", "google_federated", "none"],
              authWord,
            )}
            onChange={(e) => set("authKind", e.target.value as EndpointDraft["authKind"])}
          />
        </FormField>
        {draft.authKind === "header" && (
          <FormField label="Header name" error={errors.authHeader}>
            <TextInput
              value={draft.authHeader}
              onChange={(e) => set("authHeader", e.target.value)}
            />
          </FormField>
        )}
        {scope === "service" && draft.authKind !== "none" && (
          <FormField
            label="Credential"
            hint="Per team: each team's own key or federation. Shared: one service key for every team."
          >
            <SelectInput
              value={draft.credentialMode}
              options={[
                { value: "per_team", label: "Per team" },
                { value: "shared", label: "Shared" },
              ]}
              onChange={(e) =>
                set("credentialMode", e.target.value as EndpointDraft["credentialMode"])
              }
            />
          </FormField>
        )}
        {scope === "service" && (
          <p>
            <Switch
              label="Extra terms: a service admin selects it per team"
              checked={draft.requiresTerms}
              onChange={(v) => set("requiresTerms", v)}
              showLabel
            />
          </p>
        )}
      </>
    );
  return (
    <>
      <FormField
        label="Pricing"
        hint="Per token counts against the team's hard cap. Capacity and free are metered and reported only."
      >
        <SelectInput
          value={draft.pricingMode}
          options={opts(["per_token", "capacity", "free"], pricingWord)}
          onChange={(e) => set("pricingMode", e.target.value as EndpointDraft["pricingMode"])}
        />
      </FormField>
      {scope === "service" && draft.pricingMode === "per_token" && (
        <p>
          <Switch
            label="Use the provider's reported cost when the response carries one"
            checked={draft.useProviderCost}
            onChange={(v) => set("useProviderCost", v)}
            showLabel
          />
        </p>
      )}
      <ModelsEditor
        models={draft.models}
        priced={draft.pricingMode === "per_token"}
        error={errors.models}
        onChange={(m) => set("models", m)}
      />
    </>
  );
}

function ModelsEditor({
  models,
  priced,
  error,
  onChange,
}: {
  models: readonly EndpointModelDraft[];
  priced: boolean;
  error: string | undefined;
  onChange: (m: readonly EndpointModelDraft[]) => void;
}) {
  // stable row keys: a row keeps its key when another row is removed
  const [ids, setIds] = useState<number[]>(() => models.map((_, n) => n));
  const [next, setNext] = useState(models.length);
  const rowIds = models.map((_, n) => ids[n] ?? -1 - n);
  const put = (i: number, m: EndpointModelDraft) =>
    onChange(models.map((x, n) => (n === i ? m : x)));
  return (
    <fieldset>
      <legend>Models</legend>
      {priced && (
        <p>
          Prices are USD per million tokens. A model without both prices is saved but is not
          callable until a price is approved.
        </p>
      )}
      {models.map((m, i) => (
        <fieldset key={rowIds[i]} style={{ display: "flex", gap: 8 }}>
          <legend>{`Model ${i + 1}`}</legend>
          <FormField label="Model name">
            <TextInput
              value={m.modelName}
              onChange={(e) => put(i, { ...m, modelName: e.target.value })}
            />
          </FormField>
          <FormField label="Max output tokens">
            <TextInput
              inputMode="numeric"
              value={String(m.maxOutputTokens || "")}
              onChange={(e) => put(i, { ...m, maxOutputTokens: Number(e.target.value) || 0 })}
            />
          </FormField>
          {priced && (
            <>
              <FormField label="Input $/MTok">
                <TextInput
                  inputMode="decimal"
                  value={m.inputUsdPerMtok ?? ""}
                  onChange={(e) => put(i, { ...m, inputUsdPerMtok: e.target.value })}
                />
              </FormField>
              <FormField label="Output $/MTok">
                <TextInput
                  inputMode="decimal"
                  value={m.outputUsdPerMtok ?? ""}
                  onChange={(e) => put(i, { ...m, outputUsdPerMtok: e.target.value })}
                />
              </FormField>
            </>
          )}
          <Button
            aria-label={`Remove model ${i + 1}`}
            onClick={() => {
              setIds(rowIds.filter((_, n) => n !== i));
              onChange(models.filter((_, n) => n !== i));
            }}
          >
            Remove
          </Button>
        </fieldset>
      ))}
      {error && <div role="alert">{error}</div>}
      <Button
        onClick={() => {
          setIds([...rowIds, next]);
          setNext(next + 1);
          onChange([...models, { modelName: "", maxOutputTokens: 4096 }]);
        }}
      >
        Add model
      </Button>
    </fieldset>
  );
}
