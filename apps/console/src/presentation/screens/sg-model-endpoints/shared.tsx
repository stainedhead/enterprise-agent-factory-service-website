// Pieces shared by the model-endpoint screens (SG1..SG6, TG1..TG5): badges, the error alert and the query keys.
import type { AppError } from "../../../application/errors.js";
import { isAppError } from "../../../application/errors.js";
import { badgesOf } from "../../../domain/modelEndpoints.js";
import { Alert, Badge } from "../../components/index.js";
import { DeniedAlert } from "../../query/DeniedAlert.js";
import { queryKey } from "../../query/keys.js";

export const AREA = "model-endpoints";
export const catalogKey = queryKey({ area: AREA, resource: "catalog" });
export const providersKey = queryKey({ area: AREA, resource: "providers" });
export const proposalsKey = queryKey({ area: AREA, resource: "proposals" });
export const endpointKey = (id: string) => queryKey({ area: AREA, resource: "endpoint", id });
export const endpointTeamsKey = (id: string) => queryKey({ area: AREA, resource: "teams", id });
export const teamRoutesKey = (teamId: string) =>
  queryKey({ area: AREA, teamId, resource: "routes" });

const TONE: Record<string, "blue" | "teal" | "grey" | "amber"> = {
  "Built-in": "blue",
  Metered: "teal",
  Capped: "blue",
  "Extra terms": "amber",
};

/** The route's badges, in the mockups' order (Built-in, Metered, Capped, Extra terms). */
export function RouteBadges({ e }: { e: Parameters<typeof badgesOf>[0] }) {
  return (
    <>
      {badgesOf(e).map((b) => (
        <span key={b} style={{ marginRight: 4 }}>
          <Badge tone={TONE[b] ?? "grey"}>{b}</Badge>
        </span>
      ))}
    </>
  );
}

/** The first failed request of a page, as the API's answer: access denied names the role, others the message. */
export function ErrorAlert({
  errors,
  title = "The request failed",
}: {
  errors: readonly unknown[];
  title?: string;
}) {
  const err: AppError | undefined = errors
    .map((e) => (isAppError(e) ? e : undefined))
    .find(Boolean);
  if (!err) return null;
  if (err.isAccessDenied) return <DeniedAlert error={err} />;
  return (
    <Alert kind="error" title={title} requestId={err.requestId}>
      {err.message}
    </Alert>
  );
}

/** `$1,234.50` from a decimal string; `—` when absent. */
export const usd = (v: string | null | undefined): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n)
    ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : v;
};
