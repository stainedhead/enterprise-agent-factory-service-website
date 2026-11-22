import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { OrgAccountRecord } from "../../../../../application/ports/adminOrgAccounts.js";
import type { RoleLinkRecord } from "../../../../../application/ports/identity.js";
import { SESSION_CHOICES } from "../../../../../application/usecases/identity/IdentityUseCases.js";
import {
  Alert,
  Button,
  FormField,
  Modal,
  SelectInput,
  TextInput,
} from "../../../../components/index.js";
import { useService } from "../../../../services.js";

/** *Add cross-account role*: only accounts inside the team's filter (WEB-US-31.2). */
export function AddRoleDialog({
  teamId,
  agent,
  accounts,
  onClose,
  onCreated,
}: {
  teamId: string;
  agent: { id: string; iamIdentity: string };
  accounts: readonly OrgAccountRecord[];
  onClose: () => void;
  onCreated: (l: RoleLinkRecord) => void;
}) {
  const identity = useService("identity");
  const [accountId, setAccountId] = useState(accounts[0]?.accountId ?? "");
  const [roleArn, setRoleArn] = useState("");
  const [profileName, setProfileName] = useState("");
  const [seconds, setSeconds] = useState(3600);
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;

  const submit = async () => {
    setPending(true);
    try {
      onCreated(
        await identity.addRoleLink(
          teamId,
          agent,
          { accountId, roleArn, profileName, maxSessionSeconds: seconds },
          accounts.map((a) => a.accountId),
        ),
      );
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      title="Add cross-account role"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            Add role
          </Button>
        </>
      }
    >
      {err && Object.keys(err.fields).length === 0 && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The role was not added"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField
        label="Account"
        hint="Organization accounts inside this team's allowed-accounts filter"
        error={err?.fields.accountId}
      >
        <SelectInput
          value={accountId}
          options={accounts.map((a) => ({
            value: a.accountId,
            label: `${a.name ?? a.accountId} · ${a.accountId}`,
          }))}
          onChange={(e) => setAccountId(e.target.value)}
        />
      </FormField>
      <FormField
        label="Profile name"
        hint="The agent uses --profile with this name"
        error={err?.fields.profileName}
      >
        <TextInput value={profileName} onChange={(e) => setProfileName(e.target.value)} />
      </FormField>
      <FormField label="Role ARN in that account" error={err?.fields.roleArn}>
        <TextInput value={roleArn} onChange={(e) => setRoleArn(e.target.value)} />
      </FormField>
      <FormField label="Maximum session" error={err?.fields.maxSessionSeconds}>
        <SelectInput
          value={String(seconds)}
          options={SESSION_CHOICES.map((c) => ({ value: String(c.seconds), label: c.label }))}
          onChange={(e) => setSeconds(Number(e.target.value))}
        />
      </FormField>
    </Modal>
  );
}
