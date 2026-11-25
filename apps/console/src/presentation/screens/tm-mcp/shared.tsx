// Pieces shared by the team MCP screens (TM1..TM5, VM1).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { McpUsageUseCases, oauthOutcome } from "../../../application/usecases/mcp/McpUseCases.js";
import { mcpReasonWord } from "../../../domain/mcp.js";
import { can } from "../../../domain/me.js";
import { Alert } from "../../components/index.js";
import { useOptionalService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { teamRoutesKey } from "../sg-model-endpoints/shared.js";
import { usageKey } from "../sm-mcp/shared.js";

/** The team's gateway deployment, from the team routes (contract 1.5.0); undefined while unknown. */
export function useGatewayDeployment(teamId: string): string | undefined {
  const uc = useOptionalService("teamModelEndpoints");
  const me = useMe();
  const q = useQuery({
    queryKey: teamRoutesKey(teamId),
    queryFn: ({ signal }) =>
      uc ? uc.routes(teamId, signal) : Promise.reject(new Error("no routes service")),
    enabled: uc !== undefined && can(me, "model-endpoints:read", teamId),
    retry: false,
  });
  return q.data?.gatewayDeployment;
}

/** Calls per server key over the report's range, when the caller may read MCP usage (contract note 5). */
export function useTeamCallsByServer(teamId: string): ReadonlyMap<string, number> | undefined {
  const uc = useOptionalService("mcpUsage");
  const me = useMe();
  const q = { view: "usage", groupBy: "server" };
  const r = useQuery({
    queryKey: usageKey(`team:${teamId}`, q),
    queryFn: ({ signal }) =>
      uc ? uc.run({ level: "team", teamId }, q, signal) : Promise.reject(new Error("no usage")),
    enabled: uc !== undefined && can(me, "mcp-events:read", teamId),
    retry: false,
  });
  return r.data ? McpUsageUseCases.callsBy(r.data) : undefined;
}

/**
 * The OAuth outcome the API's callback puts on the console URL (`?mcpOAuth=connected|failed&reason=`). It is
 * read once, shown, and removed from the URL; it never carries a code or a token.
 */
export function OAuthOutcome({ onSeen }: { onSeen?: () => void }) {
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState<ReturnType<typeof oauthOutcome>>();
  const search = params.toString();
  useEffect(() => {
    const o = oauthOutcome(search);
    if (!o) return;
    setShown(o);
    const next = new URLSearchParams(search);
    next.delete("mcpOAuth");
    next.delete("reason");
    setParams(next, { replace: true });
    onSeen?.();
  }, [search, setParams, onSeen]);
  if (!shown) return null;
  return shown.ok ? (
    <Alert kind="success" title="Connected">
      The service account is connected. The gateway holds the refresh token; agents never see it.
    </Alert>
  ) : (
    <Alert kind="error" title="The connection failed">
      {shown.reason ? mcpReasonWord(shown.reason) : "The authorization server refused the request."}{" "}
      Try Connect again.
    </Alert>
  );
}

/** The viewer banner of screen 54. */
export function ViewerBanner() {
  return (
    <Alert kind="info" title="You have read-only access to this team.">
      You can see which MCP servers and tools the team uses; changes need a team-admin.
    </Alert>
  );
}
