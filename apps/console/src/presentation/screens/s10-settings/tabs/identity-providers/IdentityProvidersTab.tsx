import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../../../application/errors.js";
import type { IdentityProviderRecord } from "../../../../../application/ports/settings.js";
import type { IdentityProviderDraft } from "../../../../../application/usecases/settings/SettingsUseCases.js";
import { buildCli } from "../../../../../domain/cli.js";
import {
  ActionsMenu,
  Alert,
  Button,
  Card,
  CliPreview,
  ConfirmDialog,
  FormField,
  Modal,
  SelectInput,
  StatusIndicator,
  Table,
  TextInput,
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { ConflictAlert } from "../../../../query/ConflictAlert.js";
import { queryKey } from "../../../../query/keys.js";
import { useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";

const KINDS = [
  { value: "okta", label: "Okta" },
  { value: "entra_id", label: "Microsoft Entra ID" },
];
const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;

const emptyDraft: IdentityProviderDraft = {
  kind: "okta",
  name: "",
  issuerUrl: "",
  consoleClientId: "",
  cliClientId: "",
  groupsClaim: "",
  clientSecretArn: "",
  collabClientId: "",
  collabClientSecretArn: "",
  isDefault: false,
};
const draftOf = (p: IdentityProviderRecord): IdentityProviderDraft => ({
  kind: p.kind,
  name: p.name,
  issuerUrl: p.issuerUrl,
  consoleClientId: p.consoleClientId,
  cliClientId: p.cliClientId,
  groupsClaim: p.groupsClaim,
  clientSecretArn: p.clientSecretArn ?? "",
  collabClientId: p.collabClientId ?? "",
  collabClientSecretArn: p.collabClientSecretArn ?? "",
  isDefault: p.isDefault,
});

/** *Identity providers* section: add, edit, disable and choose the default (WEB-US-20.2). */
export function IdentityProvidersTab() {
  const idps = useService("identityProviders");
  const me = useMe();
  const qc = useQueryClient();
  const key = queryKey({ area: "settings", resource: "identity-providers" });
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => idps.list(signal) });
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"add" | "edit" | "disable" | undefined>();
  const current = list.data?.find((p) => p.id === selected[0]);
  const detail = useQuery({
    queryKey: queryKey({
      area: "settings",
      resource: "identity-provider",
      id: current?.id ?? "none",
    }),
    queryFn: ({ signal }) => idps.get(current?.id ?? "", signal),
    enabled: current !== undefined,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["settings"] });
  const denied = gate(me, "admin:identity-providers");
  const teams = detail.data?.teams;

  const act = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = isAppError(act.error) ? act.error : undefined;

  const none = current ? undefined : "Select a provider";
  const disableReason =
    none ??
    (!current?.enabled
      ? "Already disabled"
      : teams && teams.length > 0
        ? `In use by ${teams.length} team${teams.length === 1 ? "" : "s"}`
        : detail.isPending
          ? "Checking which teams use it"
          : undefined);

  return (
    <div>
      {err && !err.isAccessDenied && (
        <Alert
          kind={err.kind === "conflict" ? "warning" : "error"}
          title="The change was not applied"
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <Card
        title="Identity providers"
        actions={
          <>
            <ActionsMenu
              actions={[
                {
                  id: "edit",
                  label: "Edit",
                  disabledReason: denied ?? none,
                  onSelect: () => setDialog("edit"),
                },
                current?.enabled === false
                  ? {
                      id: "enable",
                      label: "Enable",
                      disabledReason: denied ?? none,
                      onSelect: () => current && act.mutate(() => idps.setEnabled(current, true)),
                    }
                  : {
                      id: "disable",
                      label: "Disable",
                      disabledReason: denied ?? disableReason,
                      onSelect: () => setDialog("disable"),
                    },
                {
                  id: "default",
                  label: "Make default",
                  disabledReason:
                    denied ??
                    none ??
                    (current?.isDefault
                      ? "Already the default"
                      : !current?.enabled
                        ? "Enable it first"
                        : undefined),
                  onSelect: () => current && act.mutate(() => idps.makeDefault(current)),
                },
              ]}
            />
            <Button variant="primary" disabledReason={denied} onClick={() => setDialog("add")}>
              Add provider
            </Button>
          </>
        }
      >
        <Table
          id="identity-providers"
          caption="Identity providers"
          filterLabel="Filter identity providers"
          status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
          error={isAppError(list.error) ? list.error.message : undefined}
          emptyText="No identity providers yet."
          selection={{ mode: "single", selected, onChange: setSelected }}
          columns={[
            {
              id: "name",
              header: "Name",
              alwaysVisible: true,
              sortValue: (p) => p.name,
              cell: (p) => p.name,
            },
            {
              id: "kind",
              header: "Type",
              sortValue: (p) => p.kind,
              cell: (p) => kindLabel(p.kind),
            },
            { id: "issuer", header: "Issuer", cell: (p) => p.issuerUrl },
            {
              id: "state",
              header: "State",
              cell: (p) => (
                <StatusIndicator
                  view={
                    p.enabled
                      ? { word: "Enabled", dot: "green" }
                      : { word: "Disabled", dot: "grey" }
                  }
                />
              ),
            },
            { id: "default", header: "Default", cell: (p) => (p.isDefault ? "Default" : "—") },
            {
              id: "collab",
              header: "Collaboration",
              text: (p) => (p.collabClientId ? "Configured" : "Not configured"),
              cell: (p) => (p.collabClientId ? "Configured" : "Not configured"),
            },
            {
              id: "secret",
              header: "Client secret",
              cell: (p) => (p.clientSecretArn ? <code>{p.clientSecretArn}</code> : "None"),
            },
          ]}
          items={list.data ?? []}
          getRowId={(p) => p.id}
        />
      </Card>
      {current && (
        <Card title={`Teams using ${current.name}`}>
          {detail.isError ? (
            <Alert kind="error">The teams could not be loaded.</Alert>
          ) : teams === undefined ? (
            <p>Loading…</p>
          ) : teams.length === 0 ? (
            <p>No team uses this provider.</p>
          ) : (
            <ul>
              {teams.map((t) => (
                <li key={t.id}>
                  <Link to={`/teams/${t.id}/admin`}>{t.displayName}</Link> ({t.slug})
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {dialog === "add" && (
        <ProviderDialog onClose={() => setDialog(undefined)} onSaved={() => void refresh()} />
      )}
      {dialog === "edit" && current && (
        <ProviderDialog
          existing={current}
          onClose={() => setDialog(undefined)}
          onSaved={() => void refresh()}
        />
      )}
      {dialog === "disable" && current && (
        <ConfirmDialog
          title={`Disable ${current.name}`}
          confirmLabel="Disable"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => act.mutate(() => idps.setEnabled(current, false))}
        >
          People can no longer sign in with this provider.
        </ConfirmDialog>
      )}
    </div>
  );
}

function ProviderDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing?: IdentityProviderRecord;
  onClose: () => void;
  onSaved: () => void;
}) {
  const idps = useService("identityProviders");
  const [d, setD] = useState<IdentityProviderDraft>(existing ? draftOf(existing) : emptyDraft);
  const set = <K extends keyof IdentityProviderDraft>(k: K, v: IdentityProviderDraft[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => (existing ? idps.update(existing, d) : idps.create(d)),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const err = isAppError(save.error) ? save.error : undefined;
  const f = err?.fields ?? {};
  const cli = existing
    ? undefined
    : buildCli("CreateIdentityProvider", {
        kind: d.kind,
        name: d.name || "<name>",
        issuerUrl: d.issuerUrl || "<issuer-url>",
        consoleClientId: d.consoleClientId || "<console-client-id>",
        cliClientId: d.cliClientId || "<cli-client-id>",
        ...(d.groupsClaim && { groupsClaim: d.groupsClaim }),
        ...(d.clientSecretArn && { clientSecretArn: d.clientSecretArn }),
        ...(d.collabClientId && { collabClientId: d.collabClientId }),
        ...(d.collabClientSecretArn && { collabClientSecretArn: d.collabClientSecretArn }),
        ...(d.isDefault && { isDefault: "true" }),
      });

  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Add identity provider"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={save.isPending || err?.kind === "stale"}
            onClick={() => save.mutate()}
          >
            {existing ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      {err?.kind === "stale" ? (
        <ConflictAlert
          onReload={() => {
            onSaved();
            onClose();
          }}
          requestId={err.requestId}
        />
      ) : (
        err &&
        !err.isAccessDenied &&
        Object.keys(f).length === 0 && (
          <Alert kind="error" requestId={err.requestId}>
            {err.message}
          </Alert>
        )
      )}
      {!existing && (
        <FormField label="Type" error={f.kind}>
          <SelectInput
            value={d.kind}
            options={KINDS}
            onChange={(e) => set("kind", e.target.value)}
          />
        </FormField>
      )}
      <FormField label="Name" error={f.name}>
        <TextInput value={d.name} onChange={(e) => set("name", e.target.value)} />
      </FormField>
      {!existing && (
        <FormField label="Issuer URL" hint="https://…" error={f.issuerUrl}>
          <TextInput
            type="url"
            value={d.issuerUrl}
            onChange={(e) => set("issuerUrl", e.target.value)}
          />
        </FormField>
      )}
      <FormField label="Console client id" error={f.consoleClientId}>
        <TextInput
          value={d.consoleClientId}
          onChange={(e) => set("consoleClientId", e.target.value)}
        />
      </FormField>
      <FormField label="CLI client id" error={f.cliClientId}>
        <TextInput value={d.cliClientId} onChange={(e) => set("cliClientId", e.target.value)} />
      </FormField>
      <FormField
        label="Groups claim"
        hint="The token claim that lists a person's IdP groups"
        error={f.groupsClaim}
      >
        <TextInput value={d.groupsClaim} onChange={(e) => set("groupsClaim", e.target.value)} />
      </FormField>
      <FormField
        label="Client secret ARN"
        hint="Secrets Manager ARN of the confidential client's secret. The secret value stays in AWS."
        error={f.clientSecretArn}
      >
        <TextInput
          value={d.clientSecretArn}
          onChange={(e) => set("clientSecretArn", e.target.value)}
        />
      </FormField>
      <fieldset>
        <legend>Collaboration sign-in</legend>
        <FormField label="Collaboration client id" error={f.collabClientId}>
          <TextInput
            value={d.collabClientId ?? ""}
            onChange={(e) => set("collabClientId", e.target.value)}
          />
        </FormField>
        <FormField
          label="Collaboration client secret reference"
          hint="A Secrets Manager ARN, never a value. Used by the collaboration endpoint. One redirect URI per environment: https://<collab base domain>/oauth2/callback."
          error={f.collabClientSecretArn}
        >
          <TextInput
            value={d.collabClientSecretArn ?? ""}
            onChange={(e) => set("collabClientSecretArn", e.target.value)}
          />
        </FormField>
      </fieldset>
      {!existing && (
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={d.isDefault}
            onChange={(e) => set("isDefault", e.target.checked)}
          />
          Make this the default provider
        </label>
      )}
      {cli && <CliPreview command={cli} />}
    </Modal>
  );
}
