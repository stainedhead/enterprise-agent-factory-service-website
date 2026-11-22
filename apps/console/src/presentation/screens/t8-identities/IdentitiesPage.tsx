import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import { AwsAccountAccess } from "../../components/AwsAccountAccess.js";
import { Breadcrumbs, Card, PageHeader, StatusIndicator, Table } from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { linkView } from "../t2-agents/tabs/secrets-identity/SecretsIdentityTab.js";

/**
 * T8 team view (WEB-1, WEB-US-8.2): every agent's identity and cross-account links, each opening the agent's
 * *Secrets & identity* tab, and the team's AWS account access for team roles (WD-32).
 */
export function IdentitiesPage({ teamId }: { teamId: string }) {
  const agents = useService("agents");
  const identity = useService("identity");
  const list = useQuery({
    queryKey: queryKey({ area: "agents", teamId, resource: "list" }),
    queryFn: ({ signal }) => agents.list(teamId, signal),
  });
  const ids = (list.data ?? []).map((a) => a.id);
  const links = useQuery({
    queryKey: queryKey({ area: "identity", teamId, resource: "team-links", params: { ids } }),
    queryFn: ({ signal }) => identity.linksForAgents(teamId, ids, signal),
    enabled: list.data !== undefined,
    retry: false,
  });
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Agent identities" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Agent identities" infoHref="/docs/identities" />
      <Card title="Agents">
        <Table
          id={`team-identities-${teamId}`}
          caption="Agent identities"
          filterLabel="Find agents"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="This team has no agents."
          columns={[
            {
              id: "agent",
              header: "Agent",
              alwaysVisible: true,
              sortValue: (a) => a.name,
              text: (a) => a.name,
              cell: (a) => a.name,
            },
            {
              id: "identity",
              header: "IAM identity",
              text: (a) => (a.iamIdentity === "dedicated" ? "Dedicated" : "Shared"),
              cell: (a) => (a.iamIdentity === "dedicated" ? "Dedicated role" : "Shared team role"),
            },
            {
              id: "role",
              header: "Role",
              cell: (a) => (a.iamRoleArn ? <code>{a.iamRoleArn}</code> : "—"),
            },
            {
              id: "links",
              header: "Cross-account roles",
              cell: (a) => {
                const ls = links.data?.[a.id];
                if (links.isError) return "—";
                if (!ls) return "…";
                if (ls.length === 0) return "None";
                return (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {ls.map((l) => (
                      <li key={l.id}>
                        {l.profileName} · {l.accountId}{" "}
                        <StatusIndicator view={linkView(l.status)} />
                      </li>
                    ))}
                  </ul>
                );
              },
            },
            {
              id: "open",
              header: "Actions",
              alwaysVisible: true,
              cell: (a) => (
                <Link to={`/t/${teamId}/agents/${a.id}?tab=secrets-identity`}>Open {a.name}</Link>
              ),
            },
          ]}
          items={list.data ?? []}
          getRowId={(a) => a.id}
        />
      </Card>
      <AwsAccountAccess teamId={teamId} />
    </div>
  );
}
