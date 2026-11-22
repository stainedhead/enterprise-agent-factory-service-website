import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { RoleLinkRecord } from "../../../../../application/ports/identity.js";
import { sessionLabel } from "../../../../../application/usecases/identity/IdentityUseCases.js";
import { label } from "../../../../../domain/labels.js";
import { formatLocal, utcTitle } from "../../../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  KeyValue,
  StatusIndicator,
  Table,
} from "../../../../components/index.js";
import { useTeamWriteGate } from "../../../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import type { PanelTabProps } from "../../panelTabs.js";
import { AddRoleDialog } from "./AddRoleDialog.js";
import { TrustPolicyDialog } from "./TrustPolicyDialog.js";

const DOT = {
  pending_trust: "blue",
  verified: "green",
  failed: "red",
  disabled: "grey",
} as const;

export const linkView = (status: string) => ({
  word: label("roleLinkStatus", status),
  dot: DOT[status as keyof typeof DOT] ?? "grey",
});

/** The Pod Identity association as the agent's status shows it (`IamReady`). */
function association(agent: PanelTabProps["agent"]): string {
  const c = agent.status.conditions?.find((x) => x.type === "IamReady");
  if (c) return c.status === "True" ? "Active" : "Not ready";
  return agent.iamRoleArn ? "Active" : "Pending";
}

/**
 * *Secrets & identity* (T8, WEB-US-31): the agent's AWS identity and the accounts the team may use, then its
 * cross-account roles with their trust policies and *Verify now*. Viewers see all of it read-only.
 */
export function SecretsIdentityTab({ teamId, agent }: PanelTabProps) {
  const identity = useService("identity");
  const orgAccounts = useService("adminOrgAccounts");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("identities:write");
  const dedicated = agent.iamIdentity === "dedicated";
  const linksKey = queryKey({ area: "identity", teamId, resource: "links", id: agent.id });
  const links = useQuery({
    queryKey: linksKey,
    queryFn: ({ signal }) => identity.roleLinks(teamId, agent.id, signal),
  });
  const allowed = useQuery({
    queryKey: queryKey({ area: "aws-accounts", teamId, resource: "allowed" }),
    queryFn: ({ signal }) => orgAccounts.allowed(teamId, signal),
  });
  const [dialog, setDialog] = useState<
    | { kind: "add" }
    | { kind: "trust"; link: RoleLinkRecord }
    | { kind: "remove"; link: RoleLinkRecord }
    | undefined
  >();
  const refresh = () => void qc.invalidateQueries({ queryKey: linksKey });
  const verify = useMutation({
    mutationFn: () => identity.verifyAll(teamId, agent.id, links.data ?? []),
    onSuccess: (latest) => qc.setQueryData(linksKey, latest),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (l: RoleLinkRecord) => identity.removeRoleLink(teamId, agent.id, l),
    onSettled: () => {
      setDialog(undefined);
      refresh();
    },
  });
  const trustId = dialog?.kind === "trust" ? dialog.link.id : undefined;
  const trust = useQuery({
    queryKey: queryKey({ area: "identity", teamId, resource: "trust", id: trustId }),
    queryFn: ({ signal }) => identity.roleLink(teamId, agent.id, trustId as string, signal),
    enabled: trustId !== undefined && dialog?.kind === "trust" && !dialog.link.trustPolicy,
  });
  const err = [verify.error, remove.error]
    .map((e) => (isAppError(e) ? e : undefined))
    .find(Boolean);
  const nameOf = (id: string) => allowed.data?.find((a) => a.accountId === id)?.name;
  const addReason = reason ?? (dedicated ? undefined : "Needs a dedicated role");

  return (
    <>
      <Card title="AWS identity">
        <p>
          Who this agent is in AWS. Calls carry the team and agent tags, so CloudTrail shows the
          agent.
        </p>
        <KeyValue
          items={[
            {
              label: "IAM identity",
              value: dedicated ? "Dedicated role for this agent" : "Shared team role",
            },
            {
              label: "Role",
              value: agent.iamRoleArn ? <code>{agent.iamRoleArn}</code> : "Not created yet",
            },
            { label: "Pod Identity association", value: association(agent) },
            {
              label: "Accounts this team may use",
              value: allowed.isPending
                ? "Loading…"
                : allowed.data && allowed.data.length > 0
                  ? `${allowed.data.map((a) => (a.name ? `${a.name} (${a.accountId})` : a.accountId)).join(", ")} · set by service admins`
                  : "None · set by service admins",
            },
          ]}
        />
      </Card>
      <Card
        title={`Cross-account roles (${links.data?.length ?? 0})`}
        actions={
          <>
            <Button
              disabledReason={reason}
              disabled={verify.isPending || (links.data?.length ?? 0) === 0}
              onClick={() => verify.mutate()}
            >
              Verify now
            </Button>{" "}
            <Button
              variant="primary"
              disabledReason={addReason}
              onClick={() => setDialog({ kind: "add" })}
            >
              Add cross-account role
            </Button>
          </>
        }
      >
        <p>
          Roles in other organization accounts this agent may assume. They appear as AWS profiles in
          the agent's config file.
        </p>
        {verify.isPending && <p role="status">Verifying the roles…</p>}
        {err && (
          <Alert
            kind="error"
            title={err.isAccessDenied ? "You do not have access" : "The change was not applied"}
            requestId={err.requestId}
          >
            {err.message}
          </Alert>
        )}
        <Table
          id={`role-links-${agent.id}`}
          caption={`Cross-account roles of ${agent.name}`}
          status={links.isPending ? "loading" : links.isError ? "error" : "ready"}
          error={isAppError(links.error) ? links.error.message : undefined}
          emptyText={
            dedicated
              ? "No cross-account roles yet."
              : "A cross-account role needs a dedicated role for this agent."
          }
          columns={[
            {
              id: "profile",
              header: "Profile",
              alwaysVisible: true,
              text: (l) => l.profileName,
              cell: (l) => l.profileName,
            },
            {
              id: "account",
              header: "Account",
              text: (l) => l.accountId,
              cell: (l) =>
                nameOf(l.accountId) ? `${nameOf(l.accountId)} · ${l.accountId}` : l.accountId,
            },
            { id: "role", header: "Role ARN", cell: (l) => <code>{l.roleArn}</code> },
            {
              id: "session",
              header: "Maximum session",
              cell: (l) => sessionLabel(l.maxSessionSeconds),
            },
            {
              id: "status",
              header: "Status",
              text: (l) => linkView(l.status).word,
              cell: (l) => (
                <>
                  <StatusIndicator view={linkView(l.status)} />
                  {l.status === "failed" && l.lastError && <div role="alert">{l.lastError}</div>}
                </>
              ),
            },
            {
              id: "verified",
              header: "Last verified",
              cell: (l) =>
                l.lastVerifiedAt ? (
                  <time dateTime={l.lastVerifiedAt} title={utcTitle(l.lastVerifiedAt)}>
                    {formatLocal(l.lastVerifiedAt)}
                  </time>
                ) : (
                  "—"
                ),
            },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (l) => (
                <>
                  <Button
                    aria-label={`Trust policy for ${l.profileName}`}
                    onClick={() => setDialog({ kind: "trust", link: l })}
                  >
                    Trust policy
                  </Button>{" "}
                  <Button
                    aria-label={`Remove ${l.profileName}`}
                    disabledReason={reason}
                    onClick={() => setDialog({ kind: "remove", link: l })}
                  >
                    Remove
                  </Button>
                </>
              ),
            },
          ]}
          items={links.data ?? []}
          getRowId={(l) => l.id}
        />
      </Card>
      <Card title="Secrets">
        {agent.secretBindings.length === 0 ? (
          <p>No secrets are bound to this agent.</p>
        ) : (
          <ul aria-label="Bound secrets">
            {agent.secretBindings.map((b) => (
              <li key={`${b.secretId}-${b.target}`}>
                <code>{b.secretId}</code> as {b.delivery} <code>{b.target}</code>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {dialog?.kind === "add" && (
        <AddRoleDialog
          teamId={teamId}
          agent={agent}
          accounts={allowed.data ?? []}
          onClose={() => setDialog(undefined)}
          onCreated={(l) => {
            refresh();
            setDialog({ kind: "trust", link: l });
          }}
        />
      )}
      {dialog?.kind === "trust" && (
        <TrustPolicyDialog
          link={trust.data ?? dialog.link}
          loading={trust.isPending && trust.fetchStatus !== "idle"}
          error={isAppError(trust.error) ? trust.error.message : undefined}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title={`Remove ${dialog.link.profileName}`}
          confirmLabel="Remove"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => remove.mutate(dialog.link)}
        >
          <p>
            The agent can no longer assume <code>{dialog.link.roleArn}</code>. The trust policy in
            the target account stays until its owner removes it.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
