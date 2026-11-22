import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../application/errors.js";
import type { TeamRecord } from "../../application/ports/teams.js";
import {
  matchAccounts,
  narrowing,
  parsePatterns,
} from "../../application/usecases/adminOrgAccounts/AdminOrgAccountsUseCases.js";
import { teamKey, useTeamWriteGate } from "../hooks/useTeamWriteGate.js";
import { areaKey, queryKey } from "../query/keys.js";
import { useService } from "../services.js";
import { useMe } from "../shell/ShellContext.js";
import { Alert } from "./Alert.js";
import { Button } from "./Button.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { Card, TextInput } from "./Controls.js";
import { FormField } from "./FormField.js";
import { Table } from "./Table.js";

/**
 * Team AWS account access (WEB-US-17, S6 and the T8 team view): the filter of glob patterns over account ids and
 * names, the accounts it allows with the pattern that matched and the agent links per account. The filter is
 * editable exactly when the caller holds `teams:set-aws-accounts` in the team; the switch only for service admins.
 */
export function AwsAccountAccess({ teamId }: { teamId: string }) {
  const teams = useService("teams");
  const orgAccounts = useService("adminOrgAccounts");
  const me = useMe();
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const filterReason = write.reasonFor("teams:set-aws-accounts");
  const switchReason = write.reasonFor("teams:set-guardrails");
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const accounts = useQuery({
    queryKey: queryKey({
      area: "aws-accounts",
      teamId,
      resource: me.serviceAdmin ? "org" : "allowed",
    }),
    queryFn: ({ signal }) => orgAccounts.accounts(teamId, me.serviceAdmin, signal),
  });
  const links = useQuery({
    queryKey: queryKey({ area: "aws-accounts", teamId, resource: "links" }),
    queryFn: ({ signal }) => orgAccounts.linkCounts(teamId, signal),
    retry: false,
  });
  const [text, setText] = useState<string | undefined>();
  const [confirm, setConfirm] = useState<
    { next: string[]; lost: ReturnType<typeof narrowing> } | undefined
  >();
  const t: TeamRecord | undefined = team.data;
  const current = t?.allowedAwsAccounts ?? [];
  const shown = text ?? current.join("\n");
  const patterns = parsePatterns(shown);
  const dirty = text !== undefined && patterns.join("\n") !== current.join("\n");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: teamKey(teamId) });
    void qc.invalidateQueries({ queryKey: areaKey("aws-accounts") });
  };
  const save = useMutation({
    mutationFn: (v: {
      t: TeamRecord;
      patch: { allowedAwsAccounts?: string[]; mayManageAwsAccounts?: boolean };
    }) => teams.update({ id: v.t.id, version: v.t.version }, v.patch),
    onSuccess: (_r, v) => {
      if (v.patch.allowedAwsAccounts) setText(undefined);
    },
    onSettled: () => {
      setConfirm(undefined);
      refresh();
    },
  });
  const err = isAppError(save.error) ? save.error : undefined;
  const bad = orgAccounts.check(patterns);

  const onSave = () => {
    if (!t || filterReason) return;
    if (bad) return;
    const lost = narrowing(current, patterns, accounts.data ?? [], links.data ?? {});
    if (lost.length > 0) setConfirm({ next: patterns, lost });
    else save.mutate({ t, patch: { allowedAwsAccounts: patterns } });
  };

  const rows = matchAccounts(current, accounts.data ?? [], links.data ?? {});

  return (
    <Card title="AWS account access">
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The change was not applied"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      {t && (
        <p>
          <span title={switchReason}>
            <input
              type="checkbox"
              role="switch"
              aria-label="Team manages its own accounts"
              aria-checked={t.mayManageAwsAccounts}
              checked={t.mayManageAwsAccounts}
              aria-disabled={switchReason !== undefined || save.isPending}
              onChange={(e) => {
                if (!switchReason && !save.isPending)
                  save.mutate({ t, patch: { mayManageAwsAccounts: e.target.checked } });
              }}
            />{" "}
            Team manages its own accounts
          </span>
          {switchReason && <small> ({switchReason})</small>}
        </p>
      )}
      <FormField
        label="Account filter"
        hint="Glob patterns over account ids and names, one per line or separated by commas. * allows every account."
        error={bad && dirty ? bad.fields.filter : (err?.fields.allowedAwsAccounts ?? undefined)}
      >
        <TextInput
          value={shown}
          readOnly={filterReason !== undefined}
          aria-readonly={filterReason !== undefined}
          onChange={(e) => setText(e.target.value)}
        />
      </FormField>
      <div style={{ margin: "8px 0 12px" }}>
        <Button
          variant="primary"
          disabledReason={filterReason}
          disabled={!dirty || save.isPending}
          onClick={onSave}
        >
          Save filter
        </Button>
        {filterReason && <small> {filterReason}</small>}
      </div>
      <Table
        id={`aws-accounts-${teamId}`}
        caption="Accounts the filter allows"
        filterLabel="Find accounts"
        status={accounts.isPending ? "loading" : accounts.isError ? "error" : "ready"}
        error={isAppError(accounts.error) ? accounts.error.message : undefined}
        emptyText="The filter allows no account."
        columns={[
          {
            id: "id",
            header: "Account id",
            alwaysVisible: true,
            sortValue: (r) => r.account.accountId,
            text: (r) => r.account.accountId,
            cell: (r) => r.account.accountId,
          },
          {
            id: "name",
            header: "Name",
            sortValue: (r) => r.account.name ?? "",
            text: (r) => r.account.name ?? "",
            cell: (r) => r.account.name ?? "—",
          },
          { id: "pattern", header: "Matched by", cell: (r) => <code>{r.pattern}</code> },
          {
            id: "links",
            header: "Agent links",
            sortValue: (r) => r.links,
            text: (r) => String(r.links),
            cell: (r) => (links.isError ? "—" : r.links),
          },
        ]}
        items={rows}
        getRowId={(r) => r.account.accountId}
      />
      {confirm && t && (
        <ConfirmDialog
          title="Narrow the account filter"
          confirmLabel="Save filter"
          onCancel={() => setConfirm(undefined)}
          onConfirm={() => save.mutate({ t, patch: { allowedAwsAccounts: confirm.next } })}
        >
          <p>These accounts stop being allowed. Agent links to them will be disabled:</p>
          <ul>
            {confirm.lost.map((l) => (
              <li key={l.account.accountId}>
                {l.account.accountId}
                {l.account.name ? ` (${l.account.name})` : ""}: {l.links}{" "}
                {l.links === 1 ? "link" : "links"} disabled
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </Card>
  );
}
