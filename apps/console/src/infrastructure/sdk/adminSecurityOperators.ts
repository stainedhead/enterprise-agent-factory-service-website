import { type AfsClient, adminSecurityOperators } from "@afs/sdk";
import type {
  AddOperatorInput,
  AdminSecurityOperatorsPort,
  SecurityOperatorRecord,
} from "../../application/ports/adminSecurityOperators.js";
import { toAppError } from "./errors.js";

type Wire = Awaited<ReturnType<ReturnType<typeof adminSecurityOperators>["add"]>>;
const record = (o: Wire): SecurityOperatorRecord => ({
  id: o.id,
  subjectType: o.subjectType,
  email: o.email,
  groupName: o.groupName,
  identityProviderId: o.identityProviderId,
  userId: o.userId,
  createdAt: o.createdAt,
});

/** `admin.securityOperators.*` mapped to {@link AdminSecurityOperatorsPort}. */
export class SdkAdminSecurityOperators implements AdminSecurityOperatorsPort {
  constructor(private readonly client: AfsClient) {}

  async list(signal?: AbortSignal) {
    try {
      const out: SecurityOperatorRecord[] = [];
      for await (const o of adminSecurityOperators(this.client).list({
        maxResults: 100,
        ...(signal ? { signal } : {}),
      }))
        out.push(record(o));
      return out;
    } catch (e) {
      throw toAppError(e);
    }
  }
  async add(input: AddOperatorInput) {
    try {
      return record(
        await adminSecurityOperators(this.client).add(
          input.subjectType === "user"
            ? { subjectType: "user", email: input.email }
            : {
                subjectType: "group",
                groupName: input.groupName,
                ...(input.identityProviderId && { identityProviderId: input.identityProviderId }),
              },
        ),
      );
    } catch (e) {
      throw toAppError(e);
    }
  }
  async remove(id: string) {
    try {
      await adminSecurityOperators(this.client).remove(id);
    } catch (e) {
      throw toAppError(e);
    }
  }
}
