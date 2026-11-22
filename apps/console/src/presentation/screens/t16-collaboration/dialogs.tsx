import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type {
  CollaborationRecord,
  RotateResult,
} from "../../../application/ports/collaboration.js";
import {
  MASTER_KEY,
  MASTER_KEY_TEXT,
  ROTATABLE_KEYS,
  reasonText,
} from "../../../domain/collaboration.js";
import { putCollaborationCli, rotateKeysCli } from "../../../domain/collaborationCli.js";
import { Alert, Button, CliPreview, Modal, Switch } from "../../components/index.js";
import { useService } from "../../services.js";
import { collabKey } from "./keys.js";

/**
 * *Edit endpoints* (WEB-US-44, 50): both switches and the registration mode, then a review step with the
 * equivalent command. Managed registration needs the agent to be Ready.
 */
export function EditEndpointsDialog({
  teamId,
  record,
  onClose,
}: {
  teamId: string;
  record: CollaborationRecord;
  onClose: () => void;
}) {
  const collab = useService("collaboration");
  const qc = useQueryClient();
  const [webUi, setWebUi] = useState(record.webUiEnabled);
  const [restApi, setRestApi] = useState(record.restApiEnabled);
  const [mode, setMode] = useState(record.registrationMode);
  const [review, setReview] = useState(false);
  const notReady = record.phase !== "Ready" ? "The collaboration agent must be Ready" : undefined;
  const turnsOn = (webUi && !record.webUiEnabled) || (restApi && !record.restApiEnabled);
  const modeChanged = mode !== record.registrationMode;
  const cmd = putCollaborationCli(teamId, {
    webUiEnabled: webUi,
    restApiEnabled: restApi,
    registrationMode: modeChanged ? mode : undefined,
  });
  const save = useMutation({
    mutationFn: () =>
      collab.put(teamId, record, {
        webUiEnabled: webUi,
        restApiEnabled: restApi,
        ...(modeChanged && { registrationMode: mode }),
      }),
    onSuccess: (r) => {
      qc.setQueryData(collabKey(teamId), r);
      onClose();
    },
  });
  const err = isAppError(save.error) ? save.error : undefined;
  return (
    <Modal
      title="Edit endpoints"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {review ? (
            <>
              <Button onClick={() => setReview(false)}>Back</Button>
              <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
                Save
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setReview(true)}>
              Review
            </Button>
          )}
        </>
      }
    >
      {err && (
        <Alert kind="error" title="The change was not saved" requestId={err.requestId}>
          {err.reason === "collaboration_agent_not_ready"
            ? "The collaboration agent must be Ready"
            : err.message}
          {Object.values(err.fields).map((f) => (
            <div key={f}>{reasonText(f)}</div>
          ))}
        </Alert>
      )}
      {!review ? (
        <>
          <p>
            <Switch label="Web UI" showLabel checked={webUi} onChange={setWebUi} />
          </p>
          <p>
            <Switch label="REST API" showLabel checked={restApi} onChange={setRestApi} />
          </p>
          <fieldset>
            <legend>Registration mode</legend>
            <label>
              <input
                type="radio"
                name="reg-mode"
                checked={mode === "manual"}
                onChange={() => setMode("manual")}
              />{" "}
              Manual
            </label>{" "}
            <label>
              <input
                type="radio"
                name="reg-mode"
                checked={mode === "managed"}
                aria-disabled={notReady ? true : undefined}
                aria-describedby={notReady ? "managed-note" : undefined}
                onChange={() => {
                  if (!notReady) setMode("managed");
                }}
              />{" "}
              Managed
            </label>
            {notReady && <p id="managed-note">{notReady}</p>}
          </fieldset>
        </>
      ) : (
        <>
          {turnsOn && (
            <p>
              Turning a surface on makes it reachable from the internet for people with an AFS role
              on this team. Every request is signed in and checked by AFS.
            </p>
          )}
          <ul>
            <li>Web UI: {webUi ? "On" : "Off"}</li>
            <li>REST API: {restApi ? "On" : "Off"}</li>
            <li>Registration mode: {mode === "managed" ? "Managed" : "Manual"}</li>
          </ul>
          <CliPreview command={cmd} />
        </>
      )}
    </Modal>
  );
}

/** *Rotate Paperclip keys* (WEB-US-50): names only; no value exists to show. */
export function RotateKeysDialog({ teamId, onClose }: { teamId: string; onClose: () => void }) {
  const collab = useService("collaboration");
  const [names, setNames] = useState<string[]>([...ROTATABLE_KEYS]);
  const [ack, setAck] = useState(false);
  const [result, setResult] = useState<RotateResult | undefined>();
  const run = useMutation({
    mutationFn: () => collab.rotateKeys(teamId, names),
    onSuccess: setResult,
  });
  const err = isAppError(run.error) ? run.error : undefined;
  const toggle = (n: string) =>
    setNames((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
  return (
    <Modal
      title="Rotate Paperclip keys"
      onClose={onClose}
      actions={
        result ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              disabled={run.isPending}
              {...(!ack || names.length === 0
                ? { disabledReason: names.length === 0 ? "Choose a key" : "Acknowledge first" }
                : {})}
              onClick={() => run.mutate()}
            >
              Rotate
            </Button>
          </>
        )
      }
    >
      {err && (
        <Alert kind="error" title="The keys were not rotated" requestId={err.requestId}>
          {err.reason === "master_key_not_rotatable" ? MASTER_KEY_TEXT : err.message}
        </Alert>
      )}
      {result ? (
        <div role="status">
          <p>Rotated: {result.rotated.map((r) => r.name).join(", ") || "nothing"}.</p>
          {result.signsOutEveryone && <p>Everyone is signed out of Paperclip.</p>}
          {result.agentRolloutPending && (
            <p>The collaboration agent restarts to pick up the new keys.</p>
          )}
        </div>
      ) : (
        <>
          <Alert kind="warning" title="Rotating signs everyone out">
            Rotating signs everyone out of Paperclip and restarts the collaboration agent.
          </Alert>
          {ROTATABLE_KEYS.map((n) => (
            <div key={n}>
              <label>
                <input type="checkbox" checked={names.includes(n)} onChange={() => toggle(n)} /> {n}
              </label>
            </div>
          ))}
          <div>
            <label>
              <input type="checkbox" checked={false} disabled aria-describedby="master-note" />{" "}
              {MASTER_KEY}
            </label>
            <p id="master-note">{MASTER_KEY_TEXT}</p>
          </div>
          <label>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I
            understand that everyone is signed out
          </label>
          <CliPreview command={rotateKeysCli(teamId, names)} />
        </>
      )}
    </Modal>
  );
}
