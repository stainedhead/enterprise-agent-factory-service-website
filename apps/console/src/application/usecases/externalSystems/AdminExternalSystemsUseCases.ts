import { AppError } from "../../errors.js";
import type {
  AdminExternalSystemsPort,
  CatalogSystemInput,
  CatalogSystemUpdate,
} from "../../ports/adminExternalSystems.js";
import type { ExternalSystemRecord } from "../../ports/externalSystems.js";
import { checkSystem } from "./ExternalSystemsUseCases.js";

const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

const check = (
  i: {
    name?: string | undefined;
    docsUrl?: string | undefined;
    endpoints?: readonly string[] | undefined;
  },
  creating: boolean,
): AppError | undefined => {
  if (!creating && i.name !== undefined && !i.name.trim()) return invalid("name", "Enter a name");
  if (i.docsUrl && !i.docsUrl.startsWith("https://"))
    return invalid("docsUrl", "Use an https:// address");
  return checkSystem(
    creating ? { ...i, owner: "-", purpose: "-" } : { endpoints: i.endpoints },
    creating,
  );
};

/** What enabling an unmetered system means, shown in the confirmation (WEB-US-18.3). */
export const unmeteredWarning = (name: string): string =>
  `${name} is unmetered: calls to it are not counted in usage or cost reports and are not capped by any budget.`;

/** Whether switching `system` to `enabled` needs the unmetered confirmation. */
export const needsUnmeteredConfirm = (system: ExternalSystemRecord, enabled: boolean): boolean =>
  enabled && system.unmetered;

/** The service catalog (M2-F). The API decides access; built-in systems cannot be deleted. */
export class AdminExternalSystemsUseCases {
  constructor(private readonly port: AdminExternalSystemsPort) {}

  list(signal?: AbortSignal) {
    return this.port.list(signal);
  }
  create(input: CatalogSystemInput) {
    const bad = check(input, true);
    return bad ? Promise.reject(bad) : this.port.create(input);
  }
  update(system: ExternalSystemRecord, patch: CatalogSystemUpdate) {
    const bad = check(patch, false);
    return bad
      ? Promise.reject(bad)
      : this.port.update({ id: system.id, version: system.version }, patch);
  }
  /** The service-level switch; teams then show the system off at service level. */
  setEnabled(system: ExternalSystemRecord, enabled: boolean) {
    return this.port.update({ id: system.id, version: system.version }, { enabled });
  }
  delete(system: ExternalSystemRecord) {
    if (system.builtin)
      return Promise.reject(
        new AppError({ kind: "validation", message: "Built-in systems cannot be deleted" }),
      );
    return this.port.delete({ id: system.id, version: system.version });
  }
}
