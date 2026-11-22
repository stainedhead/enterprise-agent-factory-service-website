import { isCredentialLikeName } from "../../../domain/names.js";
import { AppError } from "../../errors.js";
import type {
  AgentConfigInput,
  ConfigValueRecord,
  ConfigValuesPort,
} from "../../ports/configValues.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

/** The contract's `ConfigName`: UPPER_SNAKE, at most 128 characters. */
export const CONFIG_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
export const CREDENTIAL_MESSAGE =
  "This name looks like a credential. Credentials belong under Secrets, not in configuration values";

/** Validates a configuration value name; the message for a credential-like name points to Secrets (WEB-US-30.2). */
export function checkConfigName(name: string): AppError | undefined {
  if (!CONFIG_NAME.test(name))
    return invalid("name", "Use UPPER_SNAKE_CASE: capital letters, digits and underscores");
  if (isCredentialLikeName(name)) return invalid("name", CREDENTIAL_MESSAGE);
  return undefined;
}

/** Configuration values (M2-V1): the namespace's and each agent's. The API stays the authority on conflicts. */
export class ConfigUseCases {
  constructor(private readonly port: ConfigValuesPort) {}

  listNamespace(teamId: string, signal?: AbortSignal): Promise<readonly ConfigValueRecord[]> {
    return this.port.listNamespace(teamId, signal);
  }

  listAgent(
    teamId: string,
    agentId: string,
    signal?: AbortSignal,
  ): Promise<readonly ConfigValueRecord[]> {
    return this.port.listAgent(teamId, agentId, signal);
  }

  /** A new value (no `version`) or an edit of `existing`. */
  putNamespace(
    teamId: string,
    name: string,
    value: string,
    existing?: ConfigValueRecord,
  ): Promise<ConfigValueRecord> {
    const bad = checkConfigName(name.trim());
    if (bad) return Promise.reject(bad);
    return this.port.putNamespace(
      teamId,
      { name: name.trim(), ...(existing?.version !== undefined && { version: existing.version }) },
      value,
    );
  }

  deleteNamespace(teamId: string, value: ConfigValueRecord): Promise<void> {
    return this.port.deleteNamespace(teamId, {
      name: value.name,
      ...(value.version !== undefined && { version: value.version }),
    });
  }

  putAgent(
    teamId: string,
    agentId: string,
    name: string,
    input: AgentConfigInput,
    existing?: ConfigValueRecord,
  ): Promise<ConfigValueRecord> {
    const bad = checkConfigName(name.trim());
    if (bad) return Promise.reject(bad);
    if (input.source === "literal" && input.value === undefined)
      return Promise.reject(invalid("value", "Enter a value"));
    return this.port.putAgent(
      teamId,
      agentId,
      { name: name.trim(), ...(existing?.version !== undefined && { version: existing.version }) },
      input,
    );
  }

  deleteAgent(teamId: string, agentId: string, value: ConfigValueRecord): Promise<void> {
    return this.port.deleteAgent(teamId, agentId, {
      name: value.name,
      ...(value.version !== undefined && { version: value.version }),
    });
  }
}

/** Whether the namespace has a value named `name` (the only case *Use namespace value* is offered, WEB-US-26.5). */
export const hasNamespaceValue = (ns: readonly ConfigValueRecord[], name: string): boolean =>
  ns.some((v) => v.name === name);
