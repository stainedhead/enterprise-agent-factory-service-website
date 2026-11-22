import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { MemberRecord } from "../../../application/ports/members.js";
import { buildCli } from "../../../domain/cli.js";
import { formatLocal } from "../../../domain/time.js";
import {
  Alert,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  Modal,
  SelectInput,
  Table,
  TextInput,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { SignInProviderCard } from "./SignInProviderCard.js";

const ROLES = [
  { value: "team_admin", label: "Team admin" },
  { value: "team_viewer", label: "Team viewer" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;
const subject = (m: MemberRecord) => m.email ?? m.groupName ?? m.userId ?? m.id;

/** *Members* tab: add, change the role of and remove members (WEB-US-29.1, 29.3). */
export function MembersTab({ teamId }: { teamId: string }) {
  const members = useService("members");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const key = queryKey({ area: "members", teamId, resource: "members" });
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => members.list(teamId, signal) });
  const [dialog, setDialog] = useState<
    | { kind: "add" }
    | { kind: "role"; m: MemberRecord }
    | { kind: "remove"; m: MemberRecord }
    | undefined
  >();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const reason = write.reasonFor("members:write");

  const remove = useMutation({
    mutationFn: (m: MemberRecord) => members.remove(teamId, m),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });

  return (
    <div>
      <SignInProviderCard teamId={teamId} />
      <Card
        title="Members"
        actions={
          <Button
            variant="primary"
            disabledReason={reason}
            onClick={() => setDialog({ kind: "add" })}
          >
            Add member
          </Button>
        }
      >
        {isAppError(remove.error) && !remove.error.isAccessDenied && (
          <Alert kind="error" title="The member was not removed" requestId={remove.error.requestId}>
            {remove.error.message}
          </Alert>
        )}
        <Table
          id="team-members"
          caption="Team members"
          filterLabel="Filter members"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="No members yet."
          columns={[
            {
              id: "subject",
              header: "Member",
              alwaysVisible: true,
              sortValue: subject,
              cell: subject,
            },
            {
              id: "type",
              header: "Type",
              sortValue: (m) => m.subjectType,
              cell: (m) => (m.subjectType === "group" ? "IdP group" : "Person"),
            },
            {
              id: "role",
              header: "Role",
              sortValue: (m) => m.role,
              cell: (m) => roleLabel(m.role),
            },
            {
              id: "added",
              header: "Added",
              cell: (m) => (m.createdAt ? formatLocal(m.createdAt) : "—"),
            },
            {
              id: "actions",
              header: "Actions",
              alwaysVisible: true,
              cell: (m) => (
                <span style={{ display: "flex", gap: 8 }}>
                  <Button
                    aria-label={`Change role of ${subject(m)}`}
                    disabledReason={reason}
                    onClick={() => setDialog({ kind: "role", m })}
                  >
                    Change role
                  </Button>
                  <Button
                    aria-label={`Remove ${subject(m)}`}
                    disabledReason={write.reasonFor("members:write")}
                    onClick={() => setDialog({ kind: "remove", m })}
                  >
                    Remove
                  </Button>
                </span>
              ),
            },
          ]}
          items={list.data ?? []}
          getRowId={(m) => m.id}
        />
      </Card>
      {dialog?.kind === "add" && (
        <AddMemberDialog
          teamId={teamId}
          onClose={() => setDialog(undefined)}
          onDone={() => void refresh()}
        />
      )}
      {dialog?.kind === "role" && (
        <ChangeRoleDialog
          teamId={teamId}
          member={dialog.m}
          onClose={() => setDialog(undefined)}
          onDone={() => void refresh()}
        />
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title={`Remove ${subject(dialog.m)}`}
          confirmLabel="Remove"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => remove.mutate(dialog.m)}
        >
          They lose access to this team.
        </ConfirmDialog>
      )}
    </div>
  );
}

function AddMemberDialog({
  teamId,
  onClose,
  onDone,
}: {
  teamId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const members = useService("members");
  const providers = useService("signInProviders");
  const list = useQuery({
    queryKey: queryKey({ area: "members", resource: "sign-in-providers" }),
    queryFn: () => providers.execute(),
  });
  const [type, setType] = useState<"user" | "group">("user");
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState("");
  const [role, setRole] = useState("team_viewer");
  const [idp, setIdp] = useState("");
  const add = useMutation({
    mutationFn: () =>
      members.add(teamId, {
        subjectType: type,
        role,
        ...(type === "user" ? { email } : { groupName: group }),
        ...(type === "group" && idp !== "" && { identityProviderId: idp }),
      }),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const err = isAppError(add.error) ? add.error : undefined;
  const providerOptions = (list.data?.providers ?? []).map((p) => ({ value: p.id, label: p.name }));
  const cli = buildCli("AddMember", {
    teamId,
    role,
    subjectType: type,
    ...(type === "user" ? { email: email || "<email>" } : { groupName: group || "<group>" }),
    ...(type === "group" && idp !== "" && { identityProviderId: idp }),
  });

  return (
    <Modal
      title="Add member"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={add.isPending} onClick={() => add.mutate()}>
            Add
          </Button>
        </>
      }
    >
      {err && !err.isAccessDenied && (
        <Alert kind="error" title="The member was not added" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField label="Add">
        <SelectInput
          value={type}
          options={[
            { value: "user", label: "A person, by email" },
            { value: "group", label: "An IdP group" },
          ]}
          onChange={(e) => setType(e.target.value as "user" | "group")}
        />
      </FormField>
      {type === "user" ? (
        <FormField label="Email" error={err?.fields.email}>
          <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
      ) : (
        <>
          <FormField label="Group name" error={err?.fields.groupName}>
            <TextInput value={group} onChange={(e) => setGroup(e.target.value)} />
          </FormField>
          {providerOptions.length > 1 && (
            <FormField label="Identity provider" error={err?.fields.identityProviderId}>
              <SelectInput
                value={idp}
                placeholder="Team's provider"
                options={providerOptions}
                onChange={(e) => setIdp(e.target.value)}
              />
            </FormField>
          )}
        </>
      )}
      <FormField label="Role" hint="Service admin is not offered here." error={err?.fields.role}>
        <SelectInput value={role} options={ROLES} onChange={(e) => setRole(e.target.value)} />
      </FormField>
      <CliPreview command={cli} />
    </Modal>
  );
}

function ChangeRoleDialog({
  teamId,
  member,
  onClose,
  onDone,
}: {
  teamId: string;
  member: MemberRecord;
  onClose: () => void;
  onDone: () => void;
}) {
  const members = useService("members");
  const [role, setRole] = useState(member.role);
  const change = useMutation({
    mutationFn: () => members.updateRole(teamId, member, role),
    onSuccess: () => {
      onDone();
      onClose();
    },
  });
  const err = isAppError(change.error) ? change.error : undefined;
  return (
    <Modal
      title={`Change role of ${subject(member)}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={change.isPending || role === member.role}
            onClick={() => change.mutate()}
          >
            Save
          </Button>
        </>
      }
    >
      {err?.kind === "stale" ? (
        <ConflictAlert
          onReload={() => {
            onDone();
            onClose();
          }}
          requestId={err.requestId}
        />
      ) : (
        err &&
        !err.isAccessDenied && (
          <Alert kind="error" requestId={err.requestId}>
            {err.message}
          </Alert>
        )
      )}
      <FormField label="Role" error={err?.fields.role}>
        <SelectInput value={role} options={ROLES} onChange={(e) => setRole(e.target.value)} />
      </FormField>
    </Modal>
  );
}
