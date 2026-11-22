import { Card } from "../../../components/index.js";

/** How secrets and configuration reach the agent (WEB-US-26.2): environment variables and files, no code change. */
export function HelpPanel() {
  return (
    <Card title="How secrets and configuration reach the agent">
      <p>
        Secrets and configuration values arrive in the agent's pod as environment variables and as
        files. The agent reads them like any other setting, so no code change is needed to use them.
      </p>
      <ul>
        <li>Secrets are delivered as an environment variable or as a file you name.</li>
        <li>
          Configuration values are delivered as environment variables and as files under{" "}
          <code>/etc/afs/config</code>.
        </li>
        <li>Secret values are never shown in the console after they are saved.</li>
      </ul>
    </Card>
  );
}
