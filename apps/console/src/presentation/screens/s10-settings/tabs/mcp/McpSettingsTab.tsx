import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { settingText } from "../../../../../application/usecases/settings/SettingsUseCases.js";
import { APPROVAL_POLICIES, putSettingCli } from "../../../../../domain/mcp.js";
import { Alert, Button, Card, CliPreview, KeyValue } from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";
import { ErrorAlert, SETTINGS_KEY } from "../../../sm-mcp/shared.js";

const POLICY_KEY = "mcp.team_server_approval";
const SHOWN = [
  "mcp.enabled",
  "mcp.default_agent_mode",
  "mcp.host_deny_list",
  "mcp.corporate_domains",
  "mcp.allowed_image_registries",
  "mcp.image_signature_policy",
  "mcp.placement_default",
  "mcp.query_capture_max_days",
];

/** *MCP* section of S10 (MCP-WEB-1, PRD §8): who approves team servers, and the other MCP settings. */
export function McpSettingsTab() {
  const settings = useService("settings");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:settings");
  const list = useQuery({ queryKey: SETTINGS_KEY, queryFn: ({ signal }) => settings.list(signal) });
  const policy = list.data?.find((s) => s.key === POLICY_KEY);
  const current = typeof policy?.value === "string" ? policy.value : "team_all";
  const [chosen, setChosen] = useState<string | undefined>();
  const value = chosen ?? current;
  const save = useMutation({
    mutationFn: () =>
      policy ? settings.putValue(policy, value) : Promise.reject(new Error("no setting")),
    onSuccess: () => {
      setChosen(undefined);
      void qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
  return (
    <>
      <Card title="Team server approval">
        <ErrorAlert errors={[list.error, save.error]} title="The setting was not saved" />
        <fieldset style={{ border: 0, padding: 0 }}>
          <legend>Who approves a team-registered MCP server</legend>
          {APPROVAL_POLICIES.map((p) => (
            <label key={p.value} style={{ display: "block", margin: "8px 0" }}>
              <input
                type="radio"
                name="mcp-approval-policy"
                value={p.value}
                checked={value === p.value}
                aria-disabled={reason !== undefined || undefined}
                onChange={() => reason === undefined && setChosen(p.value)}
              />{" "}
              <b>{p.label}</b>
              <span style={{ display: "block", marginLeft: 24 }}>{p.consequence}</span>
            </label>
          ))}
        </fieldset>
        <Button
          variant="primary"
          disabled={save.isPending}
          disabledReason={reason ?? (value === current ? "Nothing changed" : undefined)}
          onClick={() => save.mutate()}
        >
          Save approval policy
        </Button>
        <CliPreview command={putSettingCli(POLICY_KEY, value)} />
      </Card>
      <Card title="Other MCP settings">
        <KeyValue
          items={SHOWN.map((k) => {
            const s = list.data?.find((x) => x.key === k);
            return { label: k, value: s ? settingText(s.value) || "—" : "—" };
          })}
        />
        <p>
          Edit these on the <Link to="/settings/general">Settings</Link> tab. Query capture for
          search tuning starts from the <Link to="/reports/mcp?view=discovery">MCP report</Link>.
        </p>
        <Alert kind="info" title="No credential values">
          MCP credentials are set per server and are write-only; no setting holds one.
        </Alert>
      </Card>
    </>
  );
}
