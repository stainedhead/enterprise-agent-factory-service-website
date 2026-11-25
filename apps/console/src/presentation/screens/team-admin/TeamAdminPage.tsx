import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import { label } from "../../../domain/labels.js";
import { format } from "../../../domain/money.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Breadcrumbs,
  Card,
  GenerationNote,
  KeyValue,
  PageHeader,
  StatusIndicator,
  Tabs,
} from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { usePolledQuery } from "../../query/usePolledQuery.js";
import { useService } from "../../services.js";
import { NotFoundPage } from "../../shell/pages.js";
import { teamView } from "../s2-teams/TeamsPage.js";
import { tabs } from "./tabs.js";

/** Team detail for service admins (`/teams/:teamId/admin`): a summary plus the tabs other streams add. */
export function TeamAdminPage({ teamId }: { teamId: string }) {
  const teams = useService("teams");
  const [params, setParams] = useSearchParams();
  const ids = ["summary", ...tabs.map((x) => x.id)];
  const wanted = params.get("tab") ?? "summary";
  const active = ids.includes(wanted) ? wanted : "summary";
  const q = usePolledQuery({
    queryKey: queryKey({ area: "teams", teamId, resource: "team" }),
    queryFn: ({ signal }) => teams.get(teamId, signal),
    phasesOf: (t) => [t.state === "deleting" ? "Reconciling" : t.status.phase],
  });
  if (q.isError) {
    if (isAppError(q.error) && q.error.kind === "not-found") return <NotFoundPage team />;
    return (
      <Alert kind="error" requestId={isAppError(q.error) ? q.error.requestId : undefined}>
        {q.error instanceof Error ? q.error.message : "The team could not be loaded."}
      </Alert>
    );
  }
  const t = q.data;
  if (!t) return <p role="status">Loading…</p>;
  const summary = (
    <Card title="Summary">
      <KeyValue
        items={[
          { label: "Slug", value: t.slug },
          { label: "Namespace", value: t.namespace },
          { label: "Kind", value: label("teamKind", t.kind) },
          { label: "State", value: <StatusIndicator view={teamView(t)} /> },
          {
            label: "Reconcile",
            value: (
              <GenerationNote generation={t.generation} observed={t.status.observedGeneration} />
            ),
          },
          { label: "Budget", value: format(t.maxBudgetUsd) },
          { label: "Effective ceiling", value: format(t.effectiveCeilingUsd) },
          { label: "Cost center", value: t.costCenter ?? "—" },
          { label: "Owner", value: t.ownerEmail ?? "—" },
          { label: "Isolation tier", value: label("isolationTier", t.isolationTier) },
          { label: "Viewer kubectl", value: t.viewerKubectl ? "On" : "Off" },
          { label: "Expires", value: t.expiresAt ? formatLocal(t.expiresAt) : "—" },
        ]}
      />
      <p>
        <Link to={`/t/${t.id}`}>Open the team overview</Link>
      </p>
    </Card>
  );
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Teams", to: "/teams" },
          { label: t.slug },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title={t.displayName} description={`Team administration for ${t.slug}`} />
      <Tabs
        label="Team administration"
        activeId={active}
        onChange={(id) => setParams(id === "summary" ? {} : { tab: id }, { replace: true })}
        tabs={[
          { id: "summary", label: "Summary", content: summary },
          ...tabs.map((x) => ({
            id: x.id,
            label: x.label,
            content: x.render?.({ teamId }) ?? null,
          })),
        ]}
      />
    </div>
  );
}

/** Reads one team for pages that only need its name (kept here so the query key stays in one place). */
export function useTeam(teamId: string) {
  const teams = useService("teams");
  return useQuery({
    queryKey: queryKey({ area: "teams", teamId, resource: "team" }),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
}
