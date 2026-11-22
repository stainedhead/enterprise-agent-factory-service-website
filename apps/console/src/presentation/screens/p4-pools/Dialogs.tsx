import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type {
  PoolRecord,
  PoolRoleLinkRecord,
  StageRecord,
} from "../../../application/ports/pools.js";
import { buildCli } from "../../../domain/cli.js";
import { Alert, Button, CliPreview, FormField, Modal, TextInput } from "../../components/index.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";

/** The reason an action failed, as a dialog alert. */
export function ErrorAlert({ error, title }: { error: unknown; title: string }) {
  if (!isAppError(error)) return null;
  return (
    <Alert
      kind="error"
      title={error.isAccessDenied ? "You do not have access" : title}
      requestId={error.requestId}
    >
      {error.message}
    </Alert>
  );
}

const fieldsOf = (e: unknown): Record<string, string> => (isAppError(e) ? { ...e.fields } : {});

/** *Scale* (0 to 200 workers) with the equivalent CLI command (WEB-US-39.5). */
export function ScaleDialog({
  teamId,
  pool,
  busy,
  error,
  onCancel,
  onScale,
}: {
  teamId: string;
  pool: PoolRecord;
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onScale: (workers: string) => void;
}) {
  const [workers, setWorkers] = useState(String(pool.workers));
  const f = fieldsOf(error);
  return (
    <Modal
      title={`Scale ${pool.name}`}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => onScale(workers)}>
            Scale
          </Button>
        </>
      }
    >
      <ErrorAlert error={error} title="The pool was not scaled" />
      <FormField label="Workers" hint="From 0 to 200" error={f.workers}>
        <TextInput
          inputMode="numeric"
          value={workers}
          onChange={(e) => setWorkers(e.target.value)}
        />
      </FormField>
      <CliPreview
        command={buildCli("ScalePool", {
          teamId,
          poolId: pool.id,
          workers: /^\d+$/.test(workers) ? Number(workers) : "<workers>",
        })}
      />
    </Modal>
  );
}

/** *Add stage* and *Move* share one form: a name (new stages only) and a position from 1 to 50. */
export function StageDialog({
  teamId,
  stage,
  busy,
  error,
  onCancel,
  onSave,
}: {
  teamId: string;
  stage?: StageRecord;
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (v: { name: string; position: string; description: string }) => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [position, setPosition] = useState(stage ? String(stage.position) : "");
  const [description, setDescription] = useState(stage?.description ?? "");
  const f = fieldsOf(error);
  return (
    <Modal
      title={stage ? `Move stage ${stage.name}` : "Add stage"}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => onSave({ name, position, description })}
          >
            {stage ? "Save" : "Add stage"}
          </Button>
        </>
      }
    >
      <ErrorAlert error={error} title="The stage was not saved" />
      {!stage && (
        <FormField label="Stage name" hint="Lower-case letters, digits and hyphens" error={f.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </FormField>
      )}
      <FormField label="Position" hint="From 1 to 50; stages run in this order" error={f.position}>
        <TextInput
          inputMode="numeric"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
        />
      </FormField>
      {!stage && (
        <FormField label="Description">
          <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
        </FormField>
      )}
      <CliPreview
        command={
          stage
            ? buildCli("UpdateStage", {
                teamId,
                stageId: stage.id,
                position: Number(position) || "<position>",
              })
            : buildCli("CreateStage", {
                teamId,
                name: name || "<name>",
                position: Number(position) || "<position>",
                description: description || undefined,
              })
        }
      />
    </Modal>
  );
}

/** *Edit handoffs*: the pools this pool hands work off to. */
export function HandoffsDialog({
  teamId,
  pool,
  others,
  busy,
  error,
  onCancel,
  onSave,
}: {
  teamId: string;
  pool: PoolRecord;
  others: readonly PoolRecord[];
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSave: (to: string[]) => void;
}) {
  const [to, setTo] = useState<string[]>([...pool.handoffs]);
  return (
    <Modal
      title={`Handoffs of ${pool.name}`}
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => onSave(to)}>
            Save handoffs
          </Button>
        </>
      }
    >
      <ErrorAlert error={error} title="The handoffs were not saved" />
      <fieldset>
        <legend>Hands work to</legend>
        {others.length === 0 && <p>This team has no other pools.</p>}
        {others.map((o) => (
          <label key={o.id} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={to.includes(o.id)}
              onChange={(e) =>
                setTo(e.target.checked ? [...to, o.id] : to.filter((x) => x !== o.id))
              }
            />{" "}
            {o.name}
          </label>
        ))}
      </fieldset>
      <CliPreview
        command={buildCli("PutPoolHandoffs", {
          teamId,
          poolId: pool.id,
          toPoolIds: to.length > 0 ? to : undefined,
        })}
      />
    </Modal>
  );
}

/** *Link shared role* (WEB-US-39.4): one role name, linked in each chosen account the team's filter allows. */
export function SharedRoleDialog({
  teamId,
  existing,
  busy,
  error,
  onCancel,
  onLink,
}: {
  teamId: string;
  existing: readonly PoolRoleLinkRecord[];
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onLink: (roleName: string, accountIds: string[], allowed: string[]) => void;
}) {
  const orgAccounts = useService("adminOrgAccounts");
  const accounts = useQuery({
    queryKey: queryKey({ area: "aws-accounts", teamId, resource: "allowed" }),
    queryFn: ({ signal }) => orgAccounts.allowed(teamId, signal),
  });
  const [roleName, setRoleName] = useState(existing[0]?.roleName ?? "");
  const [chosen, setChosen] = useState<string[]>([]);
  const f = fieldsOf(error);
  return (
    <Modal
      title="Link shared role"
      onClose={onCancel}
      actions={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() =>
              onLink(
                roleName,
                chosen,
                (accounts.data ?? []).map((a) => a.accountId),
              )
            }
          >
            Link role
          </Button>
        </>
      }
    >
      <ErrorAlert error={error} title="The role was not linked" />
      <FormField label="Role name" hint="The same role name in every account" error={f.roleName}>
        <TextInput value={roleName} onChange={(e) => setRoleName(e.target.value)} />
      </FormField>
      <fieldset>
        <legend>Accounts</legend>
        {f.accounts && <div role="alert">{f.accounts}</div>}
        {accounts.isPending && <p>Loading…</p>}
        {accounts.data?.length === 0 && <p>The team's filter allows no accounts.</p>}
        {(accounts.data ?? []).map((a) => (
          <label key={a.accountId} style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={chosen.includes(a.accountId)}
              onChange={(e) =>
                setChosen(
                  e.target.checked
                    ? [...chosen, a.accountId]
                    : chosen.filter((x) => x !== a.accountId),
                )
              }
            />{" "}
            {a.name ? `${a.name} (${a.accountId})` : a.accountId}
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}
