import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import type { ProviderRecord } from "../../../application/ports/modelEndpoints.js";
import {
  attentionDot,
  BEDROCK_ROUTE,
  type ProviderOffDraft,
  providerCredentialWord,
  providerOffBlock,
  providerStateView,
  teamSelectionWord,
  updateInferenceProviderCli,
} from "../../../domain/modelEndpoints.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  KeyValue,
  Modal,
  SelectInput,
  StatusIndicator,
  Switch,
  Table,
  TextInput,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey, queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { AREA, ErrorAlert, providersKey } from "./shared.js";

/** SG6 (screens 68, 68a; MEG-WEB-6): one switch per provider, Bedrock included. */
export function ProviderPolicy() {
  const uc = useService("providerPolicy");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:inference-providers");
  const list = useQuery({ queryKey: providersKey, queryFn: ({ signal }) => uc.list(signal) });
  const [off, setOff] = useState<ProviderRecord | undefined>();
  const [on, setOn] = useState<ProviderRecord | undefined>();
  const turnOn = useMutation({
    mutationFn: (v: { p: ProviderRecord; reason: string }) => uc.turnOn(v.p, v.reason),
    onSettled: () => {
      setOn(undefined);
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
    },
  });
  const rows = list.data ?? [];
  return (
    <>
      <ErrorAlert errors={[list.error, turnOn.error]} />
      <Alert kind="info" title="New install defaults">
        Bedrock, OpenAI, OpenRouter, Nous Portal, OpenCode and other external hosts start on: turn
        off the ones your enterprise does not allow. Azure and Google start off: turn them on, then
        choose teams on each team's <em>Model endpoints</em> tab.
      </Alert>
      <Card title={`Providers (${rows.length})`}>
        <p>
          Off refuses calls on the provider's routes within 60 s, removes the routes from agents,
          removes gateway egress to its hosts and closes direct LLM access. Nothing is deleted. A
          provider matches its routes by provider and by host, so a team cannot add a disabled
          provider back under a new route.
        </p>
        <Table
          id="admin-inference-providers"
          caption="Providers"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          emptyText="No providers."
          columns={[
            {
              id: "provider",
              header: "Provider",
              alwaysVisible: true,
              text: (p) => p.displayName,
              cell: (p) => (
                <>
                  {p.displayName}
                  {!p.enabled && p.disabledReason && <div>{p.disabledReason}</div>}
                </>
              ),
            },
            { id: "hosts", header: "Hosts", cell: (p) => p.hosts.join(", ") || "—" },
            { id: "routes", header: "Routes", cell: (p) => p.routes },
            { id: "teams", header: "Teams", cell: (p) => p.teams },
            { id: "selection", header: "Teams selected by", cell: (p) => teamSelectionWord(p) },
            {
              id: "credential",
              header: "Credential",
              cell: (p) => providerCredentialWord(p.provider),
            },
            {
              id: "status",
              header: "Status",
              text: (p) => providerStateView(p.enabled).word,
              cell: (p) => <StatusIndicator view={providerStateView(p.enabled)} />,
            },
            {
              id: "allowed",
              header: "Allowed",
              alwaysVisible: true,
              cell: (p) => (
                <Switch
                  label={`${p.displayName} allowed`}
                  checked={p.enabled}
                  disabledReason={reason}
                  busy={turnOn.isPending}
                  onChange={(next) => (next ? setOn(p) : setOff(p))}
                />
              ),
            },
          ]}
          items={rows}
          getRowId={(p) => p.provider}
        />
      </Card>
      <Card title="Not providers">
        <KeyValue
          items={[
            {
              label: "Corporate",
              value: "Inside the enterprise network · the endpoint's own switch",
            },
            { label: "In namespace", value: "Runs in the team's namespace · the team's endpoint" },
          ]}
        />
        <p>
          Provider changes are recorded in the <Link to="/audit">audit log</Link>.
        </p>
      </Card>
      {off && <TurnOffDialog provider={off} onClose={() => setOff(undefined)} />}
      {on && (
        <ConfirmDialog
          title={`Turn on ${on.displayName}`}
          confirmLabel="Turn on"
          withNote={{ label: "Reason (optional)" }}
          onCancel={() => setOn(undefined)}
          onConfirm={(note) => turnOn.mutate({ p: on, reason: note ?? "" })}
        >
          <p>
            Its routes can be offered to teams again. Teams chosen by service admins are not
            selected again automatically.
          </p>
          <CliPreview command={updateInferenceProviderCli(on.provider, { enabled: true })} />
        </ConfirmDialog>
      )}
    </>
  );
}

const IMPACT: readonly { key: keyof NonNullable<ProviderRecord["impact"]>; label: string }[] = [
  { key: "routes", label: "Routes refused" },
  { key: "teams", label: "Teams affected" },
  { key: "agents", label: "Agents using it" },
  { key: "agentsDegraded", label: "Agents left without a route" },
  { key: "agentsMovingToFallback", label: "Agents moving to the fallback" },
  { key: "directSystems", label: "Direct LLM access closed" },
  { key: "teamsToSelect", label: "Teams the fallback is selected for" },
];

/** Screen 68a: what turning a provider off does (a dry run), and the fields that must be set first (TC-UI-11). */
function TurnOffDialog({ provider, onClose }: { provider: ProviderRecord; onClose: () => void }) {
  const uc = useService("providerPolicy");
  const qc = useQueryClient();
  const bedrock = provider.provider === BEDROCK_ROUTE;
  const [draft, setDraft] = useState<ProviderOffDraft>({
    provider: provider.provider,
    reason: "",
    fallbackModel: "",
    selectForAllTeams: false,
  });
  const fallbacks = useQuery({
    queryKey: queryKey({ area: AREA, resource: "fallbacks" }),
    queryFn: ({ signal }) => uc.fallbackOptions(signal),
    enabled: bedrock,
  });
  const impactKey = {
    provider: provider.provider,
    fallbackModel: draft.fallbackModel,
    selectForAllTeams: draft.selectForAllTeams,
  };
  const impact = useQuery({
    queryKey: queryKey({ area: AREA, resource: "impact", params: impactKey }),
    queryFn: () => uc.impact(provider, draft),
    enabled: !bedrock || draft.fallbackModel !== "",
    retry: false,
  });
  const turnOff = useMutation({
    mutationFn: () => uc.turnOff(provider, draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      onClose();
    },
  });
  const block = providerOffBlock(draft);
  const counts = impact.data?.impact;
  return (
    <Modal
      title={`Turn off ${provider.displayName}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={turnOff.isPending}
            disabledReason={block}
            onClick={() => turnOff.mutate()}
          >
            Turn off
          </Button>
        </>
      }
    >
      <Alert kind="warning" title="Calls are refused within 60 s">
        {bedrock
          ? "Bedrock is the service default. Its route and the Bedrock model catalog stop for every team, and agents move to the fallback default model. Nothing is deleted."
          : `Every route of ${provider.displayName} is refused, removed from agents and its hosts leave gateway egress. Nothing is deleted.`}
      </Alert>
      <ErrorAlert
        errors={[impact.error, turnOff.error]}
        title={`${provider.displayName} stays on`}
      />
      {bedrock && (
        <>
          <FormField
            label="Fallback default model"
            hint="The route model agents use when they had Bedrock as their default."
          >
            <SelectInput
              value={draft.fallbackModel}
              placeholder="Choose a route model"
              options={(fallbacks.data ?? []).map((m) => ({ value: m, label: m }))}
              onChange={(e) => setDraft({ ...draft, fallbackModel: e.target.value })}
            />
          </FormField>
          <p>
            <Switch
              label="Select the fallback route for every team"
              checked={draft.selectForAllTeams}
              onChange={(v) => setDraft({ ...draft, selectForAllTeams: v })}
              showLabel
            />
          </p>
        </>
      )}
      <FormField label="Reason" hint="Shown to teams and recorded in the audit log.">
        <TextInput
          value={draft.reason}
          onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
        />
      </FormField>
      <section aria-label="Impact" aria-live="polite">
        <h3>Impact</h3>
        {impact.isFetching && <p>Checking the impact…</p>}
        {counts ? (
          <KeyValue
            items={IMPACT.filter((i) => bedrock || i.key !== "agentsMovingToFallback").map((i) => ({
              label: i.label,
              value: (
                <StatusIndicator
                  view={{ word: String(counts[i.key]), dot: attentionDot(counts[i.key]) }}
                />
              ),
            }))}
          />
        ) : (
          !impact.isFetching && <p>{bedrock ? "Choose a fallback to see the impact." : "—"}</p>
        )}
      </section>
      {block && <p role="status">{block}</p>}
      <CliPreview
        command={updateInferenceProviderCli(provider.provider, {
          enabled: false,
          ...(draft.reason.trim() ? { reason: draft.reason.trim() } : {}),
          ...(bedrock && draft.fallbackModel
            ? { fallbackModel: draft.fallbackModel, selectForAllTeams: draft.selectForAllTeams }
            : {}),
        })}
      />
    </Modal>
  );
}
