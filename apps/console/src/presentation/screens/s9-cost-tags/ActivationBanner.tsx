import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAppError } from "../../../application/errors.js";
import { Alert, Banner, Button } from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

const KEY = "billing.tag_activation_acknowledged";

/**
 * The one-time notice to activate the service and system tags as cost allocation tags in AWS Billing (WEB-US-19.4).
 * It stays until a service admin acknowledges it, which sets `billing.tag_activation_acknowledged` to `true`.
 */
export function ActivationBanner() {
  const settings = useService("settings");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:settings");
  const key = queryKey({ area: "settings", resource: "list" });
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => settings.list(signal) });
  const ack = useMutation({
    mutationFn: async () => {
      const s = (await settings.list()).find((x) => x.key === KEY);
      if (s) await settings.edit(s, "true");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
  const s = list.data?.find((x) => x.key === KEY);
  const err = isAppError(ack.error) ? ack.error : undefined;
  return (
    <>
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The notice was not acknowledged"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      {s && s.value !== true && (
        <Banner>
          Activate the service and system tags as cost allocation tags in AWS Billing, so they
          appear in the cost and usage report. Acknowledge once this is done.{" "}
          <Button disabledReason={reason} disabled={ack.isPending} onClick={() => ack.mutate()}>
            Acknowledge
          </Button>
        </Banner>
      )}
    </>
  );
}
