import { Card, FormField } from "../../../components/index.js";
import type { SectionProps } from "./types.js";

export const REMOVE_CROSS_ACCOUNT_FIRST = "Remove cross-account roles first";

/**
 * *AWS identity* (WEB-US-26.4): shared or dedicated. An agent with cross-account links (`crossAccountLinks`
 * above zero) cannot go back to the shared role: that option is disabled and says why. Cross-account roles
 * are added after the agent exists.
 */
export function IdentitySection({
  draft,
  set,
  errors,
  crossAccountLinks = 0,
}: SectionProps & { crossAccountLinks?: number }) {
  const blocked = crossAccountLinks > 0;
  return (
    <Card title="AWS identity">
      <p>
        A dedicated role gives this agent its own IAM identity, and is required for roles in other
        accounts. Add cross-account roles after the agent is created.
      </p>
      <FormField
        label="IAM identity"
        hint={blocked ? REMOVE_CROSS_ACCOUNT_FIRST : undefined}
        error={errors.iamIdentity}
      >
        <select
          value={draft.iamIdentity}
          onChange={(e) => set({ iamIdentity: e.target.value as "team_shared" | "dedicated" })}
        >
          <option
            value="team_shared"
            disabled={blocked}
            title={blocked ? REMOVE_CROSS_ACCOUNT_FIRST : undefined}
          >
            Team shared role
          </option>
          <option value="dedicated">Dedicated role for this agent</option>
        </select>
      </FormField>
    </Card>
  );
}
