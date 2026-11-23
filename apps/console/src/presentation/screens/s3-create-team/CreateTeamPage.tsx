import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { AppError, isAppError } from "../../../application/errors.js";
import { orchestrationDefaults } from "../../../application/usecases/settings/orchestrationSettings.js";
import {
  effectiveOrchestration,
  emptyTeamDraft,
  requiredTags,
  type StepId,
  type TeamDraft,
  toCreateInput,
  validateStep,
} from "../../../application/usecases/teams/teamDraft.js";
import { buildCli, type CliCommand, type CliValue } from "../../../domain/cli.js";
import { modelFlags, priceView } from "../../../domain/modelAccess.js";
import { format } from "../../../domain/money.js";
import {
  exposureLabel,
  ORCHESTRATOR_NAME,
  orchestrationShorthand,
  RUNTIME_TEXT,
  TOOLS,
  toolInfo,
  toolLabel,
} from "../../../domain/orchestration.js";
import {
  Alert,
  Badge,
  Breadcrumbs,
  CliPreview,
  ExposureControl,
  FormField,
  KeyValue,
  ModelsControl,
  OrchestrationCard,
  OrchestrationMark,
  PageHeader,
  SelectInput,
  StatusIndicator,
  TextInput,
  Wizard,
  type WizardStep,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { useDraft } from "../../hooks/useDraft.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { budgetStepVariants } from "./budgetStepVariants.js";
import {
  EphemeralBudgetStep,
  ephemeralReview,
  useEphemeralMaxDays,
} from "./ephemeral/EphemeralBudgetStep.js";

const STEPS: { id: StepId; title: string }[] = [
  { id: "details", title: "Details" },
  { id: "orchestration", title: "Orchestration" },
  { id: "models", title: "Models and network" },
  { id: "budget", title: "Budget" },
  { id: "members", title: "Members" },
];

/** CLI values for the draft; every field is a plain scalar, list or object, never a secret. */
export function cliValues(d: TeamDraft): Record<string, CliValue> {
  const i = toCreateInput(d);
  return {
    displayName: i.displayName,
    slug: i.slug,
    kind: i.kind,
    maxBudgetUsd: i.maxBudgetUsd,
    costCenter: i.costCenter,
    description: i.description,
    ownerEmail: i.ownerEmail,
    identityProviderId: i.identityProviderId,
    modelAccess: i.modelAccess,
    models: i.modelAccess === "selected" ? (i.models as readonly string[] | undefined) : undefined,
    maxCollaborationExposure: i.maxCollaborationExposure,
    tags: i.tags && i.tags.length > 0 ? [...i.tags] : undefined,
    budget: i.budget,
    expiresAt: i.expiresAt,
    teardownRule: i.teardownRule,
    firstAdmin: i.firstAdmin,
  };
}

/**
 * The `create-team` command (ORC-29): `--model-access`, `--models`, `--max-collaboration-exposure`, then the
 * orchestration agent as the AWS shorthand `--orchestration Tool=...,WebUiExposure=...` with the levels the form
 * resolves (the service default lowered to the limit), and `--models`/`--default-model-id` for its models.
 */
export function createTeamCli(
  d: TeamDraft,
  defaults: ReturnType<typeof orchestrationDefaults> = orchestrationDefaults(undefined),
): CliCommand {
  const base = buildCli("CreateTeam", cliValues(d));
  const o = effectiveOrchestration(d, defaults);
  return {
    ...base,
    args: [
      ...base.args,
      [
        "orchestration",
        orchestrationShorthand({
          tool: o.tool,
          webUiExposure: o.webUi,
          webApiExposure: o.webApi,
          modelId: d.orchModels.defaultModelId || undefined,
        }),
      ],
      ...(d.orchModels.access === "selected" ? modelFlags(d.orchModels).slice(0, 1) : []),
    ],
  };
}

/** S3: the five-step onboarding wizard (WEB-US-14). */
export function CreateTeamPage() {
  const me = useMe();
  const teams = useService("teams");
  const navigate = useNavigate();
  // non-secret wizard fields survive a session expiry (FR-004); discarded on create and on cancel
  const {
    value: draft,
    setValue: setDraft,
    discard,
  } = useDraft<TeamDraft>("s3-create-team", emptyTeamDraft());
  const [serverError, setServerError] = useState<AppError | undefined>();
  const providers = useProviders();
  const defaultProvider = providers.find((p) => p.isDefault)?.id ?? providers[0]?.id ?? "";

  const tagsQ = useQuery({
    queryKey: queryKey({ area: "teams", resource: "service-tags" }),
    queryFn: ({ signal }) => teams.serviceTags(signal),
  });
  const modelsQ = useQuery({
    queryKey: queryKey({ area: "teams", resource: "catalog-models" }),
    queryFn: ({ signal }) => teams.catalogModels(signal),
  });
  const settings = useOptionalService("settings");
  const settingsQ = useQuery({
    queryKey: queryKey({ area: "settings", resource: "settings" }),
    queryFn: ({ signal }) =>
      settings ? settings.list(signal) : Promise.reject(new Error("no settings service")),
    enabled: settings !== undefined,
    retry: false,
  });
  const defaults = orchestrationDefaults(settingsQ.data);
  const tags = tagsQ.data ?? [];
  const catalog = (modelsQ.data ?? []).filter((m) => m.enabled);
  const teamModels =
    draft.modelAccess === "selected" ? catalog.filter((m) => draft.models.includes(m.id)) : catalog;
  const set = <K extends keyof TeamDraft>(k: K, v: TeamDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));
  const maxDays = useEphemeralMaxDays();
  const [now] = useState(() => new Date());
  const errs = (step: StepId) =>
    validateStep(step, draft, tags, { ephemeralMaxDays: maxDays, now, defaults });
  const server = serverError?.kind === "validation" ? serverError.fields : {};
  const slugError =
    serverError?.reason === "hostname_held"
      ? "A team with this name had a collaboration endpoint that was deleted recently. Its hostname is held for 30 days. Choose another name."
      : server.slug;
  const variant = budgetStepVariants[draft.kind];
  const orch = effectiveOrchestration(draft, defaults);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setServerError(undefined);
    try {
      await teams.create(draft);
      discard();
      navigate("/teams");
    } catch (e) {
      setServerError(
        isAppError(e) ? e : new AppError({ kind: "unknown", message: "Unexpected error" }),
      );
    } finally {
      setBusy(false);
    }
  };
  const denied = gate(me, "teams:create");

  const steps: WizardStep[] = [
    {
      id: "details",
      title: "Details",
      valid: Object.keys(errs("details")).length === 0,
      content: (
        <div>
          <FormField label="Display name" error={server.displayName}>
            <TextInput
              value={draft.displayName}
              onChange={(e) => set("displayName", e.target.value)}
            />
          </FormField>
          <FormField
            label="Slug"
            hint="Lowercase letters, digits and hyphens; immutable"
            error={slugError}
          >
            <TextInput value={draft.slug} onChange={(e) => set("slug", e.target.value)} />
          </FormField>
          <FormField label="Kind" hint="Immutable after creation">
            <SelectInput
              value={draft.kind}
              onChange={(e) => set("kind", e.target.value as TeamDraft["kind"])}
              options={[
                { value: "persistent", label: "Persistent" },
                { value: "ephemeral", label: "Ephemeral" },
              ]}
            />
          </FormField>
          <FormField label="Cost center" error={server.costCenter}>
            <TextInput
              value={draft.costCenter}
              onChange={(e) => set("costCenter", e.target.value)}
            />
          </FormField>
          <FormField label="Description">
            <TextInput
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </FormField>
          <FormField
            label="Owner email"
            error={
              errs("details").ownerEmail && draft.ownerEmail !== ""
                ? errs("details").ownerEmail
                : server.ownerEmail
            }
          >
            <TextInput
              type="email"
              value={draft.ownerEmail}
              onChange={(e) => set("ownerEmail", e.target.value)}
            />
          </FormField>
          {providers.length > 1 && (
            <FormField label="Sign-in provider">
              <SelectInput
                value={draft.identityProviderId || defaultProvider}
                onChange={(e) => set("identityProviderId", e.target.value)}
                options={providers.map((p) => ({ value: p.id, label: p.name }))}
              />
            </FormField>
          )}
          {requiredTags(tags).map((t) => (
            <FormField
              key={t.key}
              label={`Tag: ${t.key}`}
              hint={t.description}
              error={server[`tags.${t.key}`] ?? server[t.key]}
            >
              {t.allowedValues && t.allowedValues.length > 0 ? (
                <SelectInput
                  value={draft.tags[t.key] ?? ""}
                  placeholder="Choose a value"
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, tags: { ...d.tags, [t.key]: e.target.value } }))
                  }
                  options={t.allowedValues.map((v) => ({ value: v, label: v }))}
                />
              ) : (
                <TextInput
                  value={draft.tags[t.key] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, tags: { ...d.tags, [t.key]: e.target.value } }))
                  }
                />
              )}
            </FormField>
          ))}
        </div>
      ),
    },
    {
      id: "orchestration",
      title: "Orchestration",
      valid: Object.keys(errs("orchestration")).length === 0,
      content: (
        <OrchestrationCard label="Orchestration agent">
          <h2>
            <OrchestrationMark /> Orchestration agent
          </h2>
          <p>
            Every team gets one orchestration agent named <code>{ORCHESTRATOR_NAME}</code>. It runs
            the collaboration tool where people and agents work together.
          </p>
          <fieldset>
            <legend>Collaboration tool</legend>
            {TOOLS.map((t) => {
              const info = toolInfo(t);
              return (
                <label key={t} style={{ display: "block" }}>
                  <input
                    type="radio"
                    name="orch-tool"
                    checked={orch.tool === t}
                    onChange={() =>
                      setDraft((d) => ({ ...d, orchTool: t, orchWebUi: "", orchWebApi: "" }))
                    }
                  />{" "}
                  <strong>{info.label}</strong>{" "}
                  {info.preview && <Badge tone="amber">Preview</Badge>}
                  {t === defaults.tool && <Badge tone="teal">Default</Badge>}
                  <span style={{ display: "block", color: "var(--muted)" }}>{info.blurb}</span>
                </label>
              );
            })}
          </fieldset>
          <fieldset>
            <legend>Endpoint limit</legend>
            <p>
              The most this team may expose. Team-admins choose within it; only a service admin
              changes it.
            </p>
            <ExposureControl
              label="Endpoint limit"
              value={orch.limit}
              limit="public"
              supported
              tool={orch.tool}
              onChange={(v) => set("maxCollaborationExposure", v)}
            />
          </fieldset>
          <fieldset>
            <legend>Starting exposure</legend>
            <ExposureControl
              label="Web UI"
              value={orch.webUi}
              limit={orch.limit}
              supported={toolInfo(orch.tool).webUi}
              tool={orch.tool}
              onChange={(v) => set("orchWebUi", v)}
            />
            {errs("orchestration").orchWebUi && (
              <p role="alert">{errs("orchestration").orchWebUi}</p>
            )}
            <ExposureControl
              label="Web API"
              value={orch.webApi}
              limit={orch.limit}
              supported={toolInfo(orch.tool).webApi}
              tool={orch.tool}
              onChange={(v) => set("orchWebApi", v)}
            />
            {errs("orchestration").orchWebApi && (
              <p role="alert">{errs("orchestration").orchWebApi}</p>
            )}
          </fieldset>
          <ModelsControl
            label="Orchestration agent models"
            value={draft.orchModels}
            allowed={teamModels}
            errors={{
              models: errs("orchestration").orchModels,
              defaultModelId: errs("orchestration").orchDefaultModel,
            }}
            onChange={(m) => set("orchModels", { ...m, modelIds: [...m.modelIds] })}
          />
          <p>
            {RUNTIME_TEXT}. Resources and volume use the service defaults and are read-only here.
          </p>
        </OrchestrationCard>
      ),
    },
    {
      id: "models",
      title: "Models and network",
      valid: Object.keys(errs("models")).length === 0,
      content: (
        <fieldset>
          <legend>Models enabled for the team</legend>
          {server.models && <div role="alert">{server.models}</div>}
          <div role="radiogroup" aria-label="Team model access">
            {(["all", "selected"] as const).map((a) => (
              <label key={a} style={{ marginRight: 12 }}>
                <input
                  type="radio"
                  name="team-model-access"
                  checked={draft.modelAccess === a}
                  onChange={() => set("modelAccess", a)}
                />{" "}
                {a === "all" ? "All" : "Selected"}
              </label>
            ))}
          </div>
          {catalog.length === 0 && <p>No models are enabled in the catalog.</p>}
          {draft.modelAccess === "selected" &&
            catalog.map((m) => (
              <label key={m.id} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={draft.models.includes(m.id)}
                  onChange={(e) =>
                    set(
                      "models",
                      e.target.checked
                        ? [...draft.models, m.id]
                        : draft.models.filter((x) => x !== m.id),
                    )
                  }
                />{" "}
                {m.displayName} <span style={{ color: "var(--muted)" }}>({m.provider})</span>{" "}
                <StatusIndicator view={priceView(m.priceState)} />
              </label>
            ))}
          {errs("models").models && <p role="alert">{errs("models").models}</p>}
          <p style={{ color: "var(--muted)" }}>
            Egress is limited to the model gateway and the allow-listed external systems.
          </p>
        </fieldset>
      ),
    },
    {
      id: "budget",
      title: "Budget",
      valid: Object.keys(errs("budget")).length === 0,
      content: (
        <div>
          {draft.kind === "ephemeral" && (
            <EphemeralBudgetStep
              budget={draft.maxBudgetUsd}
              thresholds={draft.thresholds}
              draft={draft.ephemeral}
              maxDays={maxDays}
              errors={{ ...errs("budget"), ...server }}
              now={now}
              onBudget={(v) => set("maxBudgetUsd", v)}
              onThresholds={(v) => set("thresholds", v)}
              onChange={(v) => set("ephemeral", v)}
            />
          )}
          {draft.kind !== "ephemeral" && variant.fields.includes("maxBudgetUsd") && (
            <FormField
              label="Monthly budget (USD)"
              hint="A decimal amount such as 5000.00"
              error={
                server.maxBudgetUsd ??
                (draft.maxBudgetUsd !== "" ? errs("budget").maxBudgetUsd : undefined)
              }
            >
              <TextInput
                inputMode="decimal"
                value={draft.maxBudgetUsd}
                onChange={(e) => set("maxBudgetUsd", e.target.value)}
              />
            </FormField>
          )}
          {draft.kind !== "ephemeral" && variant.fields.includes("thresholds") && (
            <FormField
              label="Alert thresholds (%)"
              hint="Comma separated, for example 50, 80, 100"
              error={errs("budget").thresholds}
            >
              <TextInput
                value={draft.thresholds}
                onChange={(e) => set("thresholds", e.target.value)}
              />
            </FormField>
          )}
        </div>
      ),
    },
    {
      id: "members",
      title: "Members",
      valid: Object.keys(errs("members")).length === 0,
      content: (
        <div>
          <FormField label="First admin is a">
            <SelectInput
              value={draft.adminType}
              onChange={(e) => set("adminType", e.target.value as TeamDraft["adminType"])}
              options={[
                { value: "user", label: "User (email)" },
                { value: "group", label: "Identity provider group" },
              ]}
            />
          </FormField>
          {draft.adminType === "user" ? (
            <FormField
              label="Admin email"
              error={
                server["firstAdmin.email"] ??
                (draft.adminEmail !== "" ? errs("members").adminEmail : undefined)
              }
            >
              <TextInput
                type="email"
                value={draft.adminEmail}
                onChange={(e) => set("adminEmail", e.target.value)}
              />
            </FormField>
          ) : (
            <FormField label="Group name" error={server["firstAdmin.groupName"]}>
              <TextInput
                value={draft.adminGroup}
                onChange={(e) => set("adminGroup", e.target.value)}
              />
            </FormField>
          )}
        </div>
      ),
    },
  ];

  const allValid = STEPS.every((s) => Object.keys(errs(s.id)).length === 0);
  const review = (
    <div>
      {serverError && (
        <Alert kind="error" title="The team was not created" requestId={serverError.requestId}>
          {serverError.message}
          {Object.keys(server).length > 0 && (
            <ul>
              {Object.entries(server).map(([f, m]) => (
                <li key={f}>
                  {f}: {m}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      {!allValid && (
        <Alert kind="warning">Some steps are incomplete. Go back to complete them.</Alert>
      )}
      <KeyValue
        items={[
          { label: "Display name", value: draft.displayName },
          { label: "Slug", value: draft.slug },
          { label: "Kind", value: draft.kind },
          { label: "Cost center", value: draft.costCenter || "—" },
          { label: "Owner", value: draft.ownerEmail || "—" },
          {
            label: "Tags",
            value:
              Object.entries(draft.tags)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ") || "—",
          },
          {
            label: "Models",
            value:
              draft.modelAccess === "all"
                ? "All models the service enables"
                : draft.models.join(", ") || "—",
          },
          {
            label: "Orchestration",
            value: `An orchestration agent named ${ORCHESTRATOR_NAME} will be created, running ${toolLabel(orch.tool)}`,
          },
          { label: "Endpoint limit", value: exposureLabel(orch.limit) },
          {
            label: "Web UI / Web API",
            value: `${exposureLabel(orch.webUi)} / ${exposureLabel(orch.webApi)}`,
          },
          {
            label: draft.kind === "ephemeral" ? "Lifetime budget" : "Budget",
            value: draft.maxBudgetUsd ? safeFormat(draft.maxBudgetUsd) : "—",
          },
          ...(draft.kind === "ephemeral" ? ephemeralReview(draft.ephemeral) : []),
          { label: "Alert thresholds", value: draft.thresholds || "—" },
          {
            label: "First admin",
            value: draft.adminType === "user" ? draft.adminEmail : `group ${draft.adminGroup}`,
          },
        ]}
      />
      {allValid && <CliPreview command={createTeamCli(draft, defaults)} />}
    </div>
  );

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Teams", to: "/teams" },
          { label: "Create team" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Create team"
        description="Onboard a team with its models, budget and first admin."
      />
      {denied && <Alert kind="info">{denied} to create teams.</Alert>}
      <Wizard
        steps={steps}
        review={review}
        submitLabel="Create team"
        onSubmit={() => {
          if (allValid && !denied) void submit();
        }}
        onCancel={() => {
          discard();
          navigate("/teams");
        }}
      />
    </div>
  );
}

function safeFormat(v: string): string {
  try {
    return format(v);
  } catch {
    return v;
  }
}

/** The providers the caller may pick for a new team: the sign-in providers of the console. */
function useProviders(): readonly { id: string; name: string; isDefault: boolean }[] {
  const listProviders = useService("signInProviders");
  const q = useQuery({
    queryKey: queryKey({ area: "teams", resource: "sign-in-providers" }),
    queryFn: () => listProviders.execute(),
  });
  return q.data?.providers ?? [];
}
