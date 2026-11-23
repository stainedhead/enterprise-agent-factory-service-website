import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { RotateResult } from "../../../application/ports/collaboration.js";
import type { OrchestrationRecord } from "../../../application/ports/orchestration.js";
import { MASTER_KEY, MASTER_KEY_TEXT, ROTATABLE_KEYS } from "../../../domain/collaboration.js";
import { rotateKeysCli } from "../../../domain/collaborationCli.js";
import {
  changeToolCli,
  changeToolWarning,
  exposureLabel,
  notApplicableText,
  PUBLIC_WARNING,
  putOrchestrationCli,
  reasonText,
  SURFACE_LABEL,
  SURFACE_TEXT,
  TOOLS,
  toolLabel,
} from "../../../domain/orchestration.js";
import { Alert, Button, CliPreview, ExposureControl, Modal } from "../../components/index.js";
import { teamKey } from "../../hooks/useTeamWriteGate.js";
import { useService } from "../../services.js";
import { orchKey } from "./keys.js";

/**
 * *Edit endpoints* (WEB-US-44, 50): each surface Off, Private or Public within the team's limit, the
 * registration mode, then a review step with the Public warning and the equivalent command.
 */
export function EditEndpointsDialog({
  teamId,
  record,
  onClose,
}: {
  teamId: string;
  record: OrchestrationRecord;
  onClose: () => void;
}) {
  const orch = useService("orchestration");
  const qc = useQueryClient();
  const [webUi, setWebUi] = useState(record.webUi.exposure);
  const [webApi, setWebApi] = useState(record.webApi.exposure);
  const [mode, setMode] = useState(record.registrationMode);
  const [review, setReview] = useState(false);
  const notReady = record.phase !== "Ready" ? "The orchestration agent must be Ready" : undefined;
  const modeChanged = mode !== record.registrationMode;
  const goesPublic =
    (webUi === "public" && record.webUi.exposure !== "public") ||
    (webApi === "public" && record.webApi.exposure !== "public");
  const cmd = putOrchestrationCli(teamId, {
    webUi,
    webApi,
    registrationMode: modeChanged ? mode : undefined,
    version: record.version,
  });
  const save = useMutation({
    mutationFn: () =>
      orch.put(teamId, record, {
        webUi,
        webApi,
        ...(modeChanged && { registrationMode: mode }),
      }),
    onSuccess: (r) => {
      qc.setQueryData(orchKey(teamId), r);
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
          {err.reason === "orchestration_agent_not_ready"
            ? "The orchestration agent must be Ready"
            : err.message}
          {Object.values(err.fields).map((f) => (
            <div key={f}>{reasonText(f)}</div>
          ))}
        </Alert>
      )}
      {!review ? (
        <>
          {(["webUi", "webApi"] as const).map((surface) => (
            <div key={surface}>
              <h3>{SURFACE_LABEL[surface]}</h3>
              <p>{SURFACE_TEXT[surface]}</p>
              <ExposureControl
                label={`${SURFACE_LABEL[surface]} exposure`}
                value={surface === "webUi" ? webUi : webApi}
                limit={record.limit}
                supported={record[surface].supported}
                tool={record.tool}
                onChange={surface === "webUi" ? setWebUi : setWebApi}
              />
              {!record[surface].supported && <p>{notApplicableText(record.tool, surface)}</p>}
            </div>
          ))}
          <p>
            This team may expose up to {exposureLabel(record.limit)}. A service admin sets the
            limit.
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
          {goesPublic && (
            <Alert kind="warning" title="Public is reachable from the internet">
              {PUBLIC_WARNING}
            </Alert>
          )}
          <ul>
            <li>Web UI: {exposureLabel(webUi)}</li>
            <li>Web API: {exposureLabel(webApi)}</li>
            <li>Registration mode: {mode === "managed" ? "Managed" : "Manual"}</li>
          </ul>
          <CliPreview command={cmd} />
        </>
      )}
    </Modal>
  );
}

/**
 * *Change tool* (ORC-11): pick the other tool, read what happens to the data, type the team slug. The new tool
 * starts empty; the old tool's data stays in a snapshot.
 */
export function ChangeToolDialog({
  teamId,
  record,
  onClose,
}: {
  teamId: string;
  record: OrchestrationRecord;
  onClose: () => void;
}) {
  const orch = useService("orchestration");
  const teams = useService("teams");
  const qc = useQueryClient();
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const slug = team.data?.slug ?? "";
  const [tool, setTool] = useState(TOOLS.find((t) => t !== record.tool) ?? record.tool);
  const [typed, setTyped] = useState("");
  const id = useId();
  const change = useMutation({
    mutationFn: () => orch.changeTool(teamId, record, tool, typed, slug),
    onSuccess: (r) => {
      qc.setQueryData(orchKey(teamId), r);
      onClose();
    },
  });
  const err = isAppError(change.error) ? change.error : undefined;
  return (
    <Modal
      title="Change collaboration tool"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={change.isPending || slug === "" || typed.trim() !== slug}
            onClick={() => change.mutate()}
          >
            Change tool
          </Button>
        </>
      }
    >
      {err && (
        <Alert kind="error" title="The tool was not changed" requestId={err.requestId}>
          {Object.values(err.fields).join(" ") || err.message}
        </Alert>
      )}
      <fieldset>
        <legend>Tool</legend>
        {TOOLS.map((t) => (
          <label key={t} style={{ marginRight: 12 }}>
            <input type="radio" name="tool" checked={tool === t} onChange={() => setTool(t)} />{" "}
            {toolLabel(t)}
          </label>
        ))}
      </fieldset>
      <Alert kind="warning" title="Read before you change">
        {changeToolWarning(record.tool, tool)}
      </Alert>
      <div>
        <label htmlFor={id}>
          Type <strong>{slug}</strong> to confirm
        </label>
        <input id={id} value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      <CliPreview command={changeToolCli(teamId, tool)} />
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
            <p>The orchestration agent restarts to pick up the new keys.</p>
          )}
        </div>
      ) : (
        <>
          <Alert kind="warning" title="Rotating signs everyone out">
            Rotating signs everyone out of Paperclip and restarts the orchestration agent.
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
