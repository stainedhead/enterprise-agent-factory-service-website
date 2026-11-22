// Shared list (architecture §3.2): one line per team kind that changes S3's budget step.
// P2 (ephemeral team) adds its line; persistent teams use the default.
export type BudgetStepVariant = "persistent" | "ephemeral";

/** Which budget-step fields a team kind shows. */
export const budgetStepVariants: Record<BudgetStepVariant, { readonly fields: readonly string[] }> =
  {
    persistent: { fields: ["maxBudgetUsd", "thresholds"] },
    ephemeral: { fields: ["maxBudgetUsd", "thresholds"] },
  };
