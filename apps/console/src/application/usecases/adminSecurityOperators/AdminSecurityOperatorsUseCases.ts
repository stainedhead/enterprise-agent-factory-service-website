import { AppError } from "../../errors.js";
import type {
  AdminSecurityOperatorsPort,
  SecurityOperatorRecord,
} from "../../ports/adminSecurityOperators.js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalid = (field: string, message: string) =>
  new AppError({ kind: "validation", message, fields: { [field]: message } });

export interface OperatorDraft {
  readonly subjectType: "user" | "group";
  readonly email: string;
  readonly groupName: string;
  readonly identityProviderId: string;
}

/** The name a binding goes by in the list: the email of a person, the name of a group. */
export const operatorName = (o: SecurityOperatorRecord): string =>
  o.subjectType === "group" ? (o.groupName ?? o.id) : (o.email ?? o.userId ?? o.id);

/** Security operators: add or remove people and IdP groups. */
export class AdminSecurityOperatorsUseCases {
  constructor(private readonly port: AdminSecurityOperatorsPort) {}

  async list(signal?: AbortSignal): Promise<readonly SecurityOperatorRecord[]> {
    return [...(await this.port.list(signal))].sort((a, b) =>
      operatorName(a).localeCompare(operatorName(b)),
    );
  }

  add(d: OperatorDraft): Promise<SecurityOperatorRecord> {
    if (d.subjectType === "user") {
      const email = d.email.trim();
      if (!email) return Promise.reject(invalid("email", "Enter an email address"));
      if (!EMAIL.test(email))
        return Promise.reject(invalid("email", "Enter an email such as ana@example.com"));
      return this.port.add({ subjectType: "user", email });
    }
    const groupName = d.groupName.trim();
    if (!groupName) return Promise.reject(invalid("groupName", "Enter the IdP group name"));
    return this.port.add({
      subjectType: "group",
      groupName,
      ...(d.identityProviderId && { identityProviderId: d.identityProviderId }),
    });
  }

  remove(o: SecurityOperatorRecord): Promise<void> {
    return this.port.remove(o.id);
  }
}
