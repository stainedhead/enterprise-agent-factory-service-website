import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import type { CreateAgentDraft } from "../../../application/usecases/agents-create/CreateAgentUseCases.js";
import { type PoolDraft, validatePool } from "../../../application/usecases/pools/PoolsUseCases.js";
import { buildCli } from "../../../domain/cli.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  FormField,
  PageHeader,
  SelectInput,
  TextInput,
} from "../../components/index.js";
import { useDraft } from "../../hooks/useDraft.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { AgentSection } from "../t3-create-agent/sections/AgentSection.js";
import { ConfigSection } from "../t3-create-agent/sections/ConfigSection.js";
import { ModelResourcesSection } from "../t3-create-agent/sections/ModelResourcesSection.js";
import { SecretsSection } from "../t3-create-agent/sections/SecretsSection.js";
import { poolsKey } from "./keys.js";

const EMPTY: PoolDraft = {
  name: "",
  template: "",
  image: "",
  persona: "",
  modelId: "",
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
  workers: "1",
  stageId: "",
  handoffs: [],
  scratchSizeGiB: "20",
  sharedVolume: "none",
};

/** The CLI command equivalent to the form as it stands (WEB-6): `create-pool`. */
export function cliForPool(teamId: string, d: PoolDraft) {
  const resources = { ...(d.cpu && { cpu: d.cpu }), ...(d.memory && { memory: d.memory }) };
  return buildCli("CreatePool", {
    teamId,
    name: d.name || "<name>",
    template: d.template || "<template>",
    image: d.image || "<image>",
    modelId: d.modelId || "<model>",
    workers: /^\d+$/.test(d.workers) ? Number(d.workers) : "<workers>",
    stageId: d.stageId || undefined,
    scratchSizeGiB: /^\d+$/.test(d.scratchSizeGiB) ? Number(d.scratchSizeGiB) : undefined,
    sharedVolume: d.sharedVolume,
    persona: d.persona || undefined,
    resources: Object.keys(resources).length > 0 ? resources : undefined,
  });
}

/** *Create pool* (WEB-US-39.2, 39.3): the T3 sections plus workers, stage, handoffs, scratch space and shared EFS. */
export function CreatePoolPage() {
  const { teamId = "" } = useParams();
  const navigate = useNavigate();
  const pools = useService("pools");
  const teams = useService("teams");
  const secrets = useService("secrets");
  const configValues = useService("configValues");
  const write = useTeamWriteGate(teamId);
  const qc = useQueryClient();
  // non-secret fields survive a session expiry (FR-004); discarded on create and on cancel
  const {
    value: draft,
    setValue: setDraft,
    restored,
    discard,
  } = useDraft<PoolDraft>(`p4-create-pool:${teamId}`, EMPTY);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);

  const templates = useQuery({
    queryKey: queryKey({ area: "agents", resource: "templates" }),
    queryFn: ({ signal }) => pools.templates(signal),
  });
  const models = useQuery({
    queryKey: queryKey({ area: "teams", teamId, resource: "models" }),
    queryFn: ({ signal }) => teams.models(teamId, signal),
  });
  const secretList = useQuery({
    queryKey: queryKey({ area: "secrets", teamId, resource: "secrets" }),
    queryFn: ({ signal }) => secrets.list(teamId, signal),
  });
  const namespace = useQuery({
    queryKey: queryKey({ area: "config", teamId, resource: "namespace" }),
    queryFn: ({ signal }) => configValues.listNamespace(teamId, signal),
  });
  const stages = useQuery({
    queryKey: poolsKey(teamId, "stages"),
    queryFn: ({ signal }) => pools.stages(teamId, signal),
  });
  const existing = useQuery({
    queryKey: poolsKey(teamId, "list"),
    queryFn: ({ signal }) => pools.list(teamId, signal),
  });
  const taken = useQuery({
    queryKey: poolsKey(teamId, "names"),
    queryFn: ({ signal }) => pools.takenNames(teamId, signal),
  });

  const set = (patch: Partial<PoolDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setAgent = (patch: Partial<CreateAgentDraft>) => set(patch as Partial<PoolDraft>);
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
  const prefilled = useRef(restored); // a restored draft is not overwritten by the template defaults
  useEffect(() => {
    if (prefilled.current || !templates.data || !models.data) return;
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
      modelId: models.data[0]?.id ?? "",
    }));
  }, [templates.data, models.data, setDraft]);

  const local = validatePool(
    draft,
    taken.data ?? [],
    (namespace.data ?? []).map((v) => v.name),
  );
  const errors: Record<string, string> = { ...serverErrors };
  for (const [k, m] of Object.entries(local))
    if (touched || (k === "name" && draft.name !== "")) errors[k] ??= m;

  const submit = useMutation({
    mutationFn: () =>
      pools.create(teamId, draft, {
        taken: taken.data ?? [],
        namespace: (namespace.data ?? []).map((v) => v.name),
      }),
    onSuccess: (r) => {
      discard();
      setServerErrors({});
      void qc.invalidateQueries({ queryKey: poolsKey(teamId) });
      if (r.failures.length > 0) {
        setFailures(r.failures.map((f) => `${f.part}: ${f.message}`));
        return;
      }
      navigate(`/t/${teamId}/pools`);
    },
    onError: (e) => {
      if (isAppError(e) && e.kind === "validation") setServerErrors({ ...e.fields });
    },
  });
  const apiErr = isAppError(submit.error) ? submit.error : undefined;
  const reason = write.reasonFor("pools:write");

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Pools & stages", to: `/t/${teamId}/pools` },
          { label: "Create pool" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Create pool"
        description="A pool is a set of identical workers in one stage. Defines desired state; the reconciler creates the workers."
      />
      {apiErr && apiErr.kind !== "validation" && (
        <Alert kind="error" title="The pool was not created" requestId={apiErr.requestId}>
          {apiErr.message}
        </Alert>
      )}
      {apiErr?.kind === "validation" && (
        <Alert kind="error" title="Check the highlighted fields" requestId={apiErr.requestId}>
          {apiErr.message}
        </Alert>
      )}
      {failures.length > 0 && (
        <Alert kind="warning" title="The pool was created, but some parts were not saved">
          {failures.join("; ")}. <Link to={`/t/${teamId}/pools`}>Open pools</Link>.
        </Alert>
      )}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <form
          style={{ flex: "1 1 560px", minWidth: 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            setServerErrors({});
            if (Object.keys(local).length === 0) submit.mutate();
          }}
        >
          <AgentSection
            draft={draft}
            set={setAgent}
            errors={errors}
            templates={templates.data ?? []}
            onTemplate={applyTemplate}
          />
          <ModelResourcesSection
            draft={draft}
            set={setAgent}
            errors={errors}
            models={models.data ?? []}
          />
          <Card title="Workers and stage">
            <FormField label="Workers" hint="Desired workers, 0 to 200" error={errors.workers}>
              <TextInput
                inputMode="numeric"
                value={draft.workers}
                onChange={(e) => set({ workers: e.target.value })}
              />
            </FormField>
            <FormField label="Stage" hint="Stages run in position order">
              <SelectInput
                value={draft.stageId}
                placeholder="No stage"
                options={(stages.data ?? []).map((s) => ({
                  value: s.id,
                  label: `${s.position}. ${s.name}`,
                }))}
                onChange={(e) => set({ stageId: e.target.value })}
              />
            </FormField>
            <fieldset>
              <legend>Hands work to</legend>
              {(existing.data ?? []).length === 0 && (
                <p>This team has no pools to hand work to yet.</p>
              )}
              {(existing.data ?? []).map((p) => (
                <label key={p.id} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={draft.handoffs.includes(p.id)}
                    onChange={(e) =>
                      set({
                        handoffs: e.target.checked
                          ? [...draft.handoffs, p.id]
                          : draft.handoffs.filter((x) => x !== p.id),
                      })
                    }
                  />{" "}
                  {p.name}
                </label>
              ))}
            </fieldset>
          </Card>
          <Card title="Storage">
            <FormField
              label="Scratch space (GiB)"
              hint="From 1 to 500"
              error={errors.scratchSizeGiB}
            >
              <TextInput
                inputMode="numeric"
                value={draft.scratchSizeGiB}
                onChange={(e) => set({ scratchSizeGiB: e.target.value })}
              />
            </FormField>
            <label style={{ display: "block" }}>
              <input
                type="checkbox"
                checked={draft.sharedVolume === "efs"}
                onChange={(e) => set({ sharedVolume: e.target.checked ? "efs" : "none" })}
              />{" "}
              Shared EFS volume
            </label>
          </Card>
          <ConfigSection
            draft={draft}
            set={setAgent}
            errors={errors}
            namespace={namespace.data ?? []}
          />
          <SecretsSection
            draft={draft}
            set={setAgent}
            errors={errors}
            secrets={secretList.data ?? []}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button
              onClick={() => {
                discard();
                navigate(`/t/${teamId}/pools`);
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
              Create pool
            </Button>
          </div>
        </form>
        <aside style={{ flex: "0 1 380px", minWidth: 0 }} aria-label="Equivalent CLI">
          <Card title="Equivalent CLI">
            <CliPreview command={cliForPool(teamId, draft)} />
            <p>Every console action maps to one CLI operation and one REST call.</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
