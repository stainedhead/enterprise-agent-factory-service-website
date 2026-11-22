import { AwsAccountAccess } from "../../../../components/AwsAccountAccess.js";

/** S6: *AWS accounts* on the service-admin team page (WEB-US-17). */
export function AwsAccountsTab({ teamId }: { teamId: string }) {
  return <AwsAccountAccess teamId={teamId} />;
}
