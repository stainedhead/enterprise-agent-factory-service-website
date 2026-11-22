import { isValidName } from "../../../domain/names.js";
import { AppError } from "../../errors.js";
import type {
  CreateSecretInput,
  SecretRecord,
  SecretRef,
  SecretsPort,
  UpdateSecretInput,
} from "../../ports/secrets.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** The prefix of the managed path (`afs/<namespace>/...`, as the contract's examples show). */
export const MANAGED_PATH_PREFIX = "afs";

/** Where a secret will live in Secrets Manager: `afs/<namespace>/[<agent>/]<name>`. Shown before creating (WEB-US-27.1). */
export function managedPath(o: {
  namespace: string;
  name: string;
  agentName?: string | undefined;
}): string {
  return [
    MANAGED_PATH_PREFIX,
    o.namespace,
    ...(o.agentName ? [o.agentName] : []),
    o.name || "<name>",
  ].join("/");
}

/**
 * Team secrets (M2-S1). The value of a secret goes straight from the input to the API call: it is an
 * argument here, never a field of anything this class returns or throws.
 */
export class SecretsUseCases {
  constructor(private readonly port: SecretsPort) {}

  list(teamId: string, signal?: AbortSignal): Promise<readonly SecretRecord[]> {
    return this.port.list(teamId, signal);
  }

  create(teamId: string, input: CreateSecretInput, value: string): Promise<SecretRecord> {
    const name = input.name.trim();
    if (!isValidName(name))
      return Promise.reject(
        invalid(
          "name",
          "Use 3 to 40 lower-case letters, digits and hyphens, starting with a letter",
        ),
      );
    if (input.scope === "agent" && !input.agentId)
      return Promise.reject(invalid("agentId", "Choose the agent this secret belongs to"));
    if (value === "") return Promise.reject(invalid("value", "Enter the secret value"));
    return this.port.create(
      teamId,
      {
        scope: input.scope,
        name,
        ...(input.description?.trim() && { description: input.description.trim() }),
        ...(input.scope === "agent" && { agentId: input.agentId }),
        ...(input.externalSystemId && { externalSystemId: input.externalSystemId }),
        ...(input.rotation && { rotation: input.rotation }),
      },
      value,
    );
  }

  update(teamId: string, ref: SecretRef, input: UpdateSecretInput): Promise<SecretRecord> {
    return this.port.update(teamId, { id: ref.id, version: ref.version }, input);
  }

  delete(teamId: string, ref: SecretRef): Promise<void> {
    return this.port.delete(teamId, { id: ref.id, version: ref.version });
  }

  putValue(teamId: string, ref: SecretRef, value: string): Promise<void> {
    if (value === "") return Promise.reject(invalid("value", "Enter the secret value"));
    return this.port.putValue(teamId, { id: ref.id, version: ref.version }, value);
  }

  rotate(teamId: string, secretId: string, value: string): Promise<SecretRecord> {
    if (value === "") return Promise.reject(invalid("value", "Enter the new secret value"));
    return this.port.rotate(teamId, secretId, value);
  }
}

/** The agent ids that restart when `secret` is rotated (WEB-US-27.3). */
export const restartedBy = (secret: Pick<SecretRecord, "boundTo">): readonly string[] =>
  secret.boundTo;
