import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../../../application/errors.js";
import type { SecurityOperatorRecord } from "../../../../../application/ports/adminSecurityOperators.js";
import {
  type OperatorDraft,
  operatorName,
} from "../../../../../application/usecases/adminSecurityOperators/AdminSecurityOperatorsUseCases.js";
import { buildCli } from "../../../../../domain/cli.js";
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
} from "../../../../components/index.js";
import { gate } from "../../../../hooks/gate.js";
import { queryKey } from "../../../../query/keys.js";
import { useOptionalService, useService } from "../../../../services.js";
import { useMe } from "../../../../shell/ShellContext.js";

const key = queryKey({ area: "admin-securityOperators", resource: "list" });
const EMPTY: OperatorDraft = {
  subjectType: "user",
  email: "",
  groupName: "",
  identityProviderId: "",
};

/** S10 *Security operators* (WEB-US-20.6): the people and IdP groups who hold the security operator role. */
export function SecurityOperatorsTab() {
  const svc = useService("adminSecurityOperators");
  const me = useMe();
  const qc = useQueryClient();
  const reason = gate(me, "admin:settings");
  const list = useQuery({ queryKey: key, queryFn: ({ signal }) => svc.list(signal) });
  const [dialog, setDialog] = useState<
    { kind: "add" } | { kind: "remove"; o: SecurityOperatorRecord } | undefined
  >();
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const remove = useMutation({
    mutationFn: (o: SecurityOperatorRecord) => svc.remove(o),
    onSuccess: () => {
      setDialog(undefined);
      void refresh();
    },
    onError: () => setDialog(undefined),
  });
  const err = [list.error, remove.error].map((e) => (isAppError(e) ? e : undefined)).find(Boolean);

  return (
    <Card
      title="Security operators"
      actions={
        <Button
          variant="primary"
          disabledReason={reason}
          onClick={() => setDialog({ kind: "add" })}
        >
          Add security operator
        </Button>
      }
    >
      <p>
        Security operators raise and track work orders and read swarm templates. They have no access
        to teams.
      </p>
      {err && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The request failed"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <Table<SecurityOperatorRecord>
        id="security-operators"
        caption="Security operators"
        filterLabel="Find security operators"
        status={list.isPending ? "loading" : list.isError ? "error" : "ready"}
        emptyText="No security operators yet."
        columns={[
          {
            id: "name",
            header: "Name",
            alwaysVisible: true,
            sortValue: operatorName,
            text: operatorName,
            cell: operatorName,
          },
          {
            id: "type",
            header: "Type",
            cell: (o) => (o.subjectType === "group" ? "IdP group" : "Person"),
          },
          {
            id: "actions",
            header: "Actions",
            alwaysVisible: true,
            cell: (o) => (
              <Button
                aria-label={`Remove ${operatorName(o)}`}
                disabledReason={reason}
                onClick={() => setDialog({ kind: "remove", o })}
              >
                Remove
              </Button>
            ),
          },
        ]}
        items={list.data ?? []}
        getRowId={(o) => o.id}
      />
      {dialog?.kind === "add" && (
        <AddDialog
          onClose={() => setDialog(undefined)}
          onAdded={() => {
            setDialog(undefined);
            void refresh();
          }}
        />
      )}
      {dialog?.kind === "remove" && (
        <ConfirmDialog
          title={`Remove ${operatorName(dialog.o)}`}
          confirmLabel="Remove"
          onCancel={() => setDialog(undefined)}
          onConfirm={() => remove.mutate(dialog.o)}
        >
          <p>They lose access to work orders and swarm templates.</p>
          <CliPreview command={buildCli("RemoveSecurityOperator", { bindingId: dialog.o.id })} />
        </ConfirmDialog>
      )}
    </Card>
  );
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const svc = useService("adminSecurityOperators");
  const idps = useOptionalService("identityProviders");
  const [d, setD] = useState<OperatorDraft>(EMPTY);
  const providers = useQuery({
    queryKey: queryKey({ area: "admin-identityProviders", resource: "list" }),
    queryFn: ({ signal }) => (idps as NonNullable<typeof idps>).list(signal),
    enabled: idps !== undefined && d.subjectType === "group",
    retry: false,
  });
  const add = useMutation({ mutationFn: () => svc.add(d), onSuccess: onAdded });
  const err = isAppError(add.error) ? add.error : undefined;
  const cli =
    d.subjectType === "user"
      ? buildCli("AddSecurityOperator", { subjectType: "user", email: d.email || "<email>" })
      : buildCli("AddSecurityOperator", {
          subjectType: "group",
          groupName: d.groupName || "<group>",
          identityProviderId: d.identityProviderId || undefined,
        });
  return (
    <Modal
      title="Add security operator"
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
      {err && Object.keys(err.fields).length === 0 && (
        <Alert
          kind="error"
          title={err.isAccessDenied ? "You do not have access" : "The operator was not added"}
          requestId={err.requestId}
        >
          {err.message}
        </Alert>
      )}
      <FormField label="Type">
        <SelectInput
          value={d.subjectType}
          onChange={(e) =>
            setD({ ...d, subjectType: e.target.value as OperatorDraft["subjectType"] })
          }
          options={[
            { value: "user", label: "Person" },
            { value: "group", label: "IdP group" },
          ]}
        />
      </FormField>
      {d.subjectType === "user" ? (
        <FormField label="Email" error={err?.fields.email}>
          <TextInput
            type="email"
            value={d.email}
            onChange={(e) => setD({ ...d, email: e.target.value })}
          />
        </FormField>
      ) : (
        <>
          <FormField label="Group name" error={err?.fields.groupName}>
            <TextInput
              value={d.groupName}
              onChange={(e) => setD({ ...d, groupName: e.target.value })}
            />
          </FormField>
          <FormField label="Identity provider" hint="Leave empty for the default provider">
            <SelectInput
              value={d.identityProviderId}
              onChange={(e) => setD({ ...d, identityProviderId: e.target.value })}
              placeholder="Default provider"
              options={(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          </FormField>
        </>
      )}
      <CliPreview command={cli} />
    </Modal>
  );
}
