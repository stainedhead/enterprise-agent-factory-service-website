import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  type CreateAgentDraft,
  type DraftErrors,
  validateDraft,
} from "../../../application/usecases/agents-create/CreateAgentUseCases.js";
import { boolFlag, buildCli } from "../../../domain/cli.js";
import { modelFlags } from "../../../domain/modelAccess.js";
import { toolLabel } from "../../../domain/orchestration.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  PageHeader,
  Switch,
} from "../../components/index.js";
import { useDraft } from "../../hooks/useDraft.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { useOptionalService, useService } from "../../services.js";
import { agentsKey } from "../t2-agents/keys.js";
import { orchKey } from "../t17-orchestration/keys.js";
import { AgentSection } from "./sections/AgentSection.js";
import { ConfigSection } from "./sections/ConfigSection.js";
import { HelpPanel } from "./sections/HelpPanel.js";
import { IdentitySection } from "./sections/IdentitySection.js";
import { ModelResourcesSection } from "./sections/ModelResourcesSection.js";
import { SecretsSection } from "./sections/SecretsSection.js";
import { StorageSection } from "./sections/StorageSection.js";

const EMPTY: CreateAgentDraft = {
  name: "",
  template: "",
  image: "",
  persona: "",
  modelAccess: "all",
  modelIds: [],
  defaultModelId: "",
  cpu: "",
  memory: "",
  sizeGiB: "20",
  storageClass: "",
  onDelete: "snapshot_then_delete",
  snapshotSchedule: "daily",
  snapshotRetain: "7",
  iamIdentity: "team_shared",
  config: [],
  bindings: [],
};

/** The CLI commands equivalent to the form as it stands (WEB-US-26.7): `create-agent`, then one per value. */
export function cliFor(teamId: string, d: CreateAgentDraft) {
  const resources = { ...(d.cpu && { cpu: d.cpu }), ...(d.memory && { memory: d.memory }) };
  const snapshots =
    d.snapshotSchedule === "off"
      ? { snapshotSchedule: "off" }
      : {
          snapshotSchedule: d.snapshotSchedule,
          ...(d.snapshotRetain && { snapshotRetain: Number(d.snapshotRetain) }),
        };
  const base = buildCli("CreateAgent", {
    teamId,
    name: d.name || "<name>",
    template: d.template || "<template>",
    image: d.image || "<image>",
    description: d.persona,
    iamIdentity: d.iamIdentity,
    resources: Object.keys(resources).length > 0 ? resources : undefined,
    volume: {
      ...(d.sizeGiB && { sizeGiB: Number(d.sizeGiB) }),
      ...(d.storageClass && { storageClass: d.storageClass }),
      onDelete: d.onDelete,
      ...snapshots,
    },
    secretBindings:
      d.bindings.length > 0
        ? d.bindings.map((b) => ({
            secretId: b.secretId || "<secret-id>",
            delivery: b.delivery,
            target: b.target,
          }))
        : undefined,
  });
  // `--models all | <id> ...` and `--default-model-id` (MOD-8), then `--collaboration-connect` when the team has a tool
  const withModels = {
    ...base,
    args: [
      ...base.args,
      ...modelFlags({
        access: d.modelAccess,
        modelIds: d.modelIds,
        defaultModelId: d.defaultModelId || "<model>",
      }),
    ],
  };
  return d.connect !== undefined
    ? { ...withModels, args: [...withModels.args, boolFlag("collaboration-connect", d.connect)] }
    : withModels;
}

/** T3 (WEB-US-26): create an agent; sections hold their own fields and the side panel shows the CLI command. */
export function CreateAgentPage() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  const agents = useService("agents");
  const teams = useService("teams");
  const secrets = useService("secrets");
  const configValues = useService("configValues");
  const create = useService("createAgent");
  const write = useTeamWriteGate(teamId);
  const qc = useQueryClient();
  // non-secret fields only: they survive a session expiry (FR-004); discarded on success and on cancel
  const {
    value: draft,
    setValue: setDraft,
    restored,
    discard,
  } = useDraft<CreateAgentDraft>(`t3-create-agent:${teamId}`, EMPTY);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [unmapped, setUnmapped] = useState<string[]>([]);

  const allTemplates = useQuery({
    queryKey: queryKey({ area: "agents", resource: "templates" }),
    queryFn: ({ signal }) => agents.templates(signal),
  });
  const orch = useOptionalService("orchestration");
  const tool = useQuery({
    queryKey: orchKey(teamId),
    queryFn: ({ signal }) =>
      orch ? orch.get(teamId, signal) : Promise.reject(new Error("no orchestration service")),
    enabled: orch !== undefined,
    retry: false,
  });
  const templates = {
    // a worker lists the service's worker templates; the orchestration runtime is never offered here (ORC-6)
    data: allTemplates.data?.filter((t) => !t.capabilities?.includes("orchestration")),
  };
  const models = useQuery({
    queryKey: queryKey({ area: "teams", teamId, resource: "models" }),
    queryFn: ({ signal }) => teams.models(teamId, signal),
  });
  const classes = useQuery({
    queryKey: queryKey({ area: "agents", resource: "storage-classes" }),
    queryFn: ({ signal }) => agents.storageClasses(signal),
  });
  const secretList = useQuery({
    queryKey: queryKey({ area: "secrets", teamId, resource: "secrets" }),
    queryFn: ({ signal }) => secrets.list(teamId, signal),
  });
  // only the team's own secrets can be bound; AFS and Paperclip manage theirs
  const bindable = (secretList.data ?? []).filter((s) => !s.managedBy || s.managedBy === "user");
  const namespace = useQuery({
    queryKey: queryKey({ area: "config", teamId, resource: "namespace" }),
    queryFn: ({ signal }) => configValues.listNamespace(teamId, signal),
  });

  const set = (patch: Partial<CreateAgentDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const hasTool = tool.data !== undefined;
  const toolName = tool.data ? toolLabel(tool.data.tool) : "the collaboration tool";
  const effective: CreateAgentDraft = {
    ...draft,
    ...(hasTool && { connect: draft.connect ?? true }),
  };
  const applyTemplate = (name: string) => {
    const t = (templates.data ?? []).find((x) => x.name === name);
    set({
      template: name,
      ...(t && {
        image: t.currentDigest,
        cpu: t.defaultResources?.cpu ?? "",
        memory: t.defaultResources?.memory ?? "",
      }),
    });
  };

  // prefill once the lists arrive: the first enabled template (its defaults), the team's first model, the first enabled class
  const prefilled = useRef(restored); // a restored draft is not overwritten by the template defaults
  useEffect(() => {
    if (prefilled.current || !templates.data || !models.data || !classes.data) return;
    prefilled.current = true;
    const t = templates.data.find((x) => x.enabled);
    setDraft((d) => ({
      ...d,
      ...(t && {
        template: t.name,
        image: t.currentDigest,
        cpu: t.defaultResources?.cpu ?? "",
        memory: t.defaultResources?.memory ?? "",
      }),
      defaultModelId: d.defaultModelId || (models.data[0]?.id ?? ""),
      storageClass: classes.data.find((c) => c.enabled)?.name ?? "",
    }));
  }, [templates.data, models.data, classes.data, setDraft]);

  const submit = useMutation({
    mutationFn: () => create.create(teamId, effective, namespace.data ?? []),
    onSuccess: (r) => {
      discard();
      setErrors({});
      void qc.invalidateQueries({ queryKey: agentsKey(teamId) });
      if (r.configFailures.length > 0) {
        setUnmapped(r.configFailures.map((f) => `${f.name}: ${f.message}`));
        return;
      }
      void qc.invalidateQueries({ queryKey: orchKey(teamId) });
      navigate(`/t/${teamId}/agents/${r.agent.id}`);
    },
    onError: (e) => {
      if (isAppError(e) && e.kind === "validation") {
        setErrors(e.fields);
        const known = new Set(Object.keys(validateDraft(draft)));
        setUnmapped(
          Object.entries(e.fields)
            .filter(([k]) => !known.has(k) && !FIELD_IDS.has(k) && !/^(config|binding)\./.test(k))
            .map(([k, m]) => `${k}: ${m}`),
        );
      }
    },
  });
  const qErr = submit.error;
  const apiErr = isAppError(qErr) ? qErr : undefined;
  const cmd = cliFor(teamId, effective);
  const reason = write.reasonFor("agents:write");

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Agents", to: `/t/${teamId}/agents` },
          { label: "Create agent" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Create agent"
        description="Defines desired state. The reconciler creates the service account, Pod Identity association, secrets and workload."
      />
      {apiErr && !apiErr.isAccessDenied && apiErr.kind !== "validation" && (
        <Alert kind="error" title="The agent was not created" requestId={apiErr.requestId}>
          {apiErr.message}
        </Alert>
      )}
      {apiErr?.kind === "validation" && Object.keys(errors).length > 0 && (
        <Alert kind="error" title="Check the highlighted fields" requestId={apiErr.requestId}>
          {unmapped.length > 0 ? unmapped.join("; ") : apiErr.message}
        </Alert>
      )}
      {!apiErr && unmapped.length > 0 && (
        <Alert
          kind="warning"
          title="The agent was created, but some configuration values were not saved"
        >
          {unmapped.join("; ")}. <Link to={`/t/${teamId}/config`}>Open configuration values</Link>.
        </Alert>
      )}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <form
          style={{ flex: "1 1 560px", minWidth: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
        >
          <AgentSection
            draft={draft}
            set={set}
            errors={errors}
            templates={templates.data ?? []}
            onTemplate={applyTemplate}
          />
          <ModelResourcesSection
            draft={draft}
            set={set}
            errors={errors}
            models={models.data ?? []}
          />
          <StorageSection draft={draft} set={set} errors={errors} classes={classes.data ?? []} />
          <IdentitySection draft={draft} set={set} errors={errors} />
          <Card title="Collaboration">
            <Switch
              label={`Connect to ${toolName}`}
              showLabel
              checked={effective.connect ?? false}
              disabledReason={hasTool ? undefined : "This team has no orchestration agent yet"}
              describedBy="collab-connect-note"
              onChange={(on) => set({ connect: on })}
            />
            <p id="collab-connect-note">
              {hasTool
                ? `The agent joins the team's ${toolName} and can read and update its work. Change this later on the Orchestration page.`
                : "This team's orchestration agent is not available yet, so the agent cannot connect."}
            </p>
          </Card>
          <HelpPanel />
          <ConfigSection
            draft={draft}
            set={set}
            errors={errors}
            namespace={namespace.data ?? []}
            readOnlyReason={reason}
          />
          <SecretsSection
            draft={draft}
            set={set}
            errors={errors}
            secrets={bindable}
            readOnlyReason={reason}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button
              onClick={() => {
                discard();
                navigate(`/t/${teamId}/agents`);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submit.isPending}
              disabledReason={reason}
            >
              Create agent
            </Button>
          </div>
        </form>
        <aside style={{ flex: "0 1 380px", minWidth: 0 }} aria-label="Equivalent CLI">
          <Card title="Equivalent CLI">
            <CliPreview command={cmd} />
            <p>Every console action maps to one CLI operation and one REST call.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}

const FIELD_IDS = new Set([
  "name",
  "template",
  "image",
  "models",
  "models.access",
  "models.modelIds",
  "models.defaultModelId",
  "defaultModelId",
  "description",
  "iamIdentity",
  "volume.sizeGiB",
  "volume.storageClass",
  "volume.onDelete",
  "volume.snapshotSchedule",
  "volume.snapshotRetain",
  "resources.cpu",
  "resources.memory",
]);
