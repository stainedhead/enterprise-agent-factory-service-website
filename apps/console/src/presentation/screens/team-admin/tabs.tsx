// Shared list: one entry per tab of the service-admin team detail page, added by the owning stream
// (S6 team AWS accounts in M4-W, guardrails in M5-G). The *Summary* tab is built in.
import type { ReactNode } from "react";
import { AwsAccountsTab } from "./tabs/aws-accounts/AwsAccountsTab.js";

export interface TabDef {
  readonly id: string;
  readonly label: string;
  /** The tab's content for the team shown. */
  readonly render?: (ctx: { teamId: string }) => ReactNode;
}
export const tabs: readonly TabDef[] = [
  {
    id: "aws-accounts",
    label: "AWS accounts",
    render: ({ teamId }) => <AwsAccountsTab teamId={teamId} />,
  },
];
