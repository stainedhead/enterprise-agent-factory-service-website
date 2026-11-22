import { useMutation, useQuery } from "@tanstack/react-query";
import { isAppError } from "../../../../application/errors.js";
import { buildCli } from "../../../../domain/cli.js";
import { can } from "../../../../domain/me.js";
import { Alert, Button, Card, CliPreview } from "../../../components/index.js";
import { teamKey } from "../../../hooks/useTeamWriteGate.js";
import { useService } from "../../../services.js";
import { useMe } from "../../../shell/ShellContext.js";
import { downloadText } from "../../t15-history/download.js";

/**
 * *Download kubeconfig* on T1 and V1 (WEB-US-23.3): shown only while the team's viewer kubectl switch is on and
 * the caller holds `teams:get-kubeconfig`. The YAML comes from `GetTeamKubeconfig` and is saved as a file; it
 * is not kept in state.
 */
export function KubeconfigCard({ teamId }: { teamId: string }) {
  const me = useMe();
  const teams = useService("teams");
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const get = useMutation({
    mutationFn: async () => {
      const yaml = await teams.kubeconfig(teamId);
      downloadText(`kubeconfig-${team.data?.slug ?? teamId}.yaml`, yaml, "application/yaml");
    },
  });
  if (!team.data?.viewerKubectl || !can(me, "teams:get-kubeconfig", teamId)) return null;
  const err = isAppError(get.error) ? get.error : undefined;
  const cmd = buildCli("GetTeamKubeconfig", { teamId });
  return (
    <Card title="Kubernetes access">
      <p>
        A read-only kubeconfig for the namespace <code>{team.data.namespace}</code>. It signs in
        through your AWS identity.
      </p>
      {err && (
        <Alert
          kind="error"
          title={
            err.isAccessDenied ? "You do not have access" : "The kubeconfig could not be downloaded"
          }
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <Button disabled={get.isPending} onClick={() => get.mutate()}>
        Download kubeconfig
      </Button>
      <CliPreview command={cmd} />
    </Card>
  );
}
