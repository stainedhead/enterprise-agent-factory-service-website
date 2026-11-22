import { useRef } from "react";
import { isAppError } from "../../../application/errors.js";
import type { SecretRecord } from "../../../application/ports/secrets.js";
import { managedPath } from "../../../application/usecases/secrets/SecretsUseCases.js";
import { buildCli } from "../../../domain/cli.js";
import {
  Alert,
  Button,
  CliPreview,
  FormField,
  Modal,
  SecretInput,
  type SecretInputHandle,
  SelectInput,
  TextInput,
} from "../../components/index.js";
import { useDraft } from "../../hooks/useDraft.js";
import { useSecretMutation } from "../../hooks/useSecretMutation.js";
import { DeniedAlert } from "../../query/DeniedAlert.js";
import { useService } from "../../services.js";

/** The non-secret fields of the create dialog, kept as a draft (FR-004). */
interface SecretDraft {
  scope: string;
  name: string;
  description: string;
  system: string;
  rotation: string;
}
const emptySecretDraft = (): SecretDraft => ({
  scope: "team",
  name: "",
  description: "",
  system: "",
  rotation: "",
});

export interface NameRef {
  readonly id: string;
  readonly name: string;
}

const ROTATION = [
  { value: "", label: "No reminder" },
  { value: "30", label: "Every 30 days" },
  { value: "90", label: "Every 90 days" },
];

/**
 * *Create secret* (WEB-US-27.1, WEB-US-11.2): the value lives in an uncontrolled input, is read by ref at
 * submit, goes through {@link useSecretMutation} and is cleared as the request completes.
 */
export function CreateSecretDialog({
  teamId,
  namespace,
  agents,
  systems,
  onClose,
  onCreated,
}: {
  teamId: string;
  namespace: string;
  agents: readonly NameRef[];
  systems: readonly NameRef[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const secrets = useService("secrets");
  const value = useRef<SecretInputHandle>(null);
  // Non-secret fields survive a session expiry (FR-004); the value stays in `SecretInput` and is never drafted.
  const draft = useDraft<SecretDraft>(`t4-create-secret:${teamId}`, emptySecretDraft());
  const { scope, name, description, system, rotation } = draft.value;
  const set = (patch: Partial<SecretDraft>) => draft.setValue((d) => ({ ...d, ...patch }));
  const close = () => {
    value.current?.clear();
    draft.discard();
    onClose();
  };
  const create = useSecretMutation((v: { value: string }) =>
    secrets.create(
      teamId,
      {
        scope: scope === "team" ? "team" : "agent",
        name,
        description,
        ...(scope !== "team" && { agentId: scope.slice("agent:".length) }),
        ...(system && { externalSystemId: system }),
        ...(rotation && { rotation: { enabled: true, days: Number(rotation) } }),
      },
      v.value,
    ),
  );
  const err = isAppError(create.error) ? create.error : undefined;
  const agentName =
    scope === "team" ? undefined : agents.find((a) => `agent:${a.id}` === scope)?.name;
  const cli = buildCli("CreateSecret", {
    teamId,
    scope: scope === "team" ? "team" : "agent",
    name: name || "<name>",
    description,
    agentId: scope === "team" ? undefined : scope.slice("agent:".length),
    externalSystemId: system || undefined,
    rotation: rotation ? { enabled: true, days: Number(rotation) } : undefined,
    value: undefined,
  });

  return (
    <Modal
      title="Create secret"
      onClose={close}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={create.pending}
            onClick={async () => {
              const r = await create.run({ value: value.current?.read() ?? "" });
              if (r) {
                draft.discard();
                onCreated();
              }
            }}
          >
            Create secret
          </Button>
        </>
      }
    >
      {err?.isAccessDenied && <DeniedAlert error={err} />}
      {err && !err.isAccessDenied && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The secret was not created" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField
        label="Scope"
        hint="Team shared: any agent in this team can be bound to it. Agent: only that agent can read it."
        error={err?.fields.scope ?? err?.fields.agentId}
      >
        <SelectInput
          value={scope}
          options={[
            { value: "team", label: "Team shared" },
            ...agents.map((a) => ({ value: `agent:${a.id}`, label: `Agent: ${a.name}` })),
          ]}
          onChange={(e) => set({ scope: e.target.value })}
        />
      </FormField>
      <FormField label="Name" error={err?.fields.name}>
        <TextInput value={name} onChange={(e) => set({ name: e.target.value })} />
      </FormField>
      <FormField label="Description" error={err?.fields.description}>
        <TextInput value={description} onChange={(e) => set({ description: e.target.value })} />
      </FormField>
      <FormField label="External system" hint="Optional" error={err?.fields.externalSystemId}>
        <SelectInput
          value={system}
          placeholder="None"
          options={systems.map((s) => ({ value: s.id, label: s.name }))}
          onChange={(e) => set({ system: e.target.value })}
        />
      </FormField>
      <FormField
        label="Secret value"
        hint="Sent once, straight to AWS Secrets Manager. Agent Factory stores only the reference and cannot show it again."
        error={err?.fields.value}
      >
        <SecretInput ref={value} />
      </FormField>
      <FormField label="Rotation reminder">
        <SelectInput
          value={rotation}
          options={ROTATION}
          onChange={(e) => set({ rotation: e.target.value })}
        />
      </FormField>
      <div>
        <div>Secrets Manager path</div>
        <code>{managedPath({ namespace, name, agentName })}</code>
        <p>Set by Agent Factory. Cannot be changed.</p>
      </div>
      <CliPreview command={cli} />
    </Modal>
  );
}

/** *Rotate* (WEB-US-27.3): a new value and a warning naming the agents that restart. */
export function RotateSecretDialog({
  teamId,
  secret,
  restarting,
  onClose,
  onRotated,
}: {
  teamId: string;
  secret: SecretRecord;
  /** Names of the agents bound to the secret. */
  restarting: readonly string[];
  onClose: () => void;
  onRotated: () => void;
}) {
  const secrets = useService("secrets");
  const value = useRef<SecretInputHandle>(null);
  const rotate = useSecretMutation((v: { value: string }) =>
    secrets.rotate(teamId, secret.id, v.value),
  );
  const err = isAppError(rotate.error) ? rotate.error : undefined;
  const cli = buildCli("RotateSecret", { teamId, secretId: secret.id, value: undefined });
  const close = () => {
    value.current?.clear();
    onClose();
  };
  return (
    <Modal
      title={`Rotate ${secret.name}`}
      onClose={close}
      actions={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            disabled={rotate.pending}
            onClick={async () => {
              const r = await rotate.run({ value: value.current?.read() ?? "" });
              if (r) onRotated();
            }}
          >
            Rotate
          </Button>
        </>
      }
    >
      <Alert kind="warning" title="Agents restart">
        {restarting.length > 0
          ? `Rotating restarts these agents so they pick up the new value: ${restarting.join(", ")}.`
          : "No agent is bound to this secret, so none restarts."}
      </Alert>
      {err?.isAccessDenied && <DeniedAlert error={err} />}
      {err && !err.isAccessDenied && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The secret was not rotated" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField
        label="New secret value"
        hint="Sent once and never shown again."
        error={err?.fields.value}
      >
        <SecretInput ref={value} />
      </FormField>
      <CliPreview command={cli} />
    </Modal>
  );
}
