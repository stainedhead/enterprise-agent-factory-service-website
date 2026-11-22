import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  rowAccess,
  SOURCE_LABEL,
  type TagRow,
  toRows,
} from "../../../application/usecases/tags/TagsUseCases.js";
import {
  Alert,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  PageHeader,
  TextInput,
} from "../../components/index.js";
import { useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";

const TONE = { system: "grey", service: "blue", team: "purple" } as const;

/**
 * T13 (WEB-US-33): the team's system, service and team tags with their source. Team-admins set required values and
 * their own tags; fixed and system tags are read-only; viewers read everything. Keys dropped from Bedrock request
 * metadata (the 16-pair limit) are listed.
 */
export function TagsPage({ teamId }: { teamId: string }) {
  const tags = useService("tags");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const reason = write.reasonFor("tags:write");
  const key = queryKey({ area: "tags", teamId, resource: "tags" });
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => tags.get(teamId, signal) });
  const [rows, setRows] = useState<TagRow[] | undefined>();
  // the draft is loaded once and again after a save; a reload after a conflict keeps the edits
  useEffect(() => {
    if (q.data && rows === undefined) setRows(toRows(q.data));
  }, [q.data, rows]);
  const save = useMutation({
    mutationFn: () => tags.save(teamId, q.data?.version, rows ?? []),
    onSuccess: (saved) => {
      qc.setQueryData(key, saved);
      setRows(toRows(saved));
    },
  });
  const err = isAppError(save.error) ? save.error : undefined;
  const problems = rows ? tags.check(rows) : {};
  const dirty =
    rows !== undefined && JSON.stringify(rows) !== JSON.stringify(q.data ? toRows(q.data) : []);
  const set = (i: number, patch: Partial<TagRow>) =>
    setRows((r) => r?.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Tags" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader title="Tags" infoHref="/docs/tags" />
      <Card title="Team tags">
        <p>
          Tags are applied to the team's AWS resources and sent on every model call. System and
          fixed service tags cannot be changed; set a value for each required tag.
        </p>
        {isAppError(q.error) && (
          <Alert kind="error" title="The tags could not be loaded" requestId={q.error.requestId}>
            {q.error.message}
          </Alert>
        )}
        {err?.kind === "stale" && (
          <ConflictAlert onReload={() => void qc.invalidateQueries({ queryKey: key })} />
        )}
        {err && err.kind !== "stale" && (
          <Alert
            kind="error"
            title={err.isAccessDenied ? "You do not have access" : "The tags were not saved"}
            requestId={err.requestId}
          >
            {err.message}
          </Alert>
        )}
        {q.data && q.data.droppedKeys.length > 0 && (
          <Alert kind="warning" title="Some tags are not sent to Bedrock">
            Bedrock accepts 16 request metadata pairs. These keys are left out of model calls but
            still applied to AWS resources: {q.data.droppedKeys.join(", ")}.
          </Alert>
        )}
        <table>
          <caption>Tags</caption>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Value</th>
              <th scope="col">Source</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r, i) => {
              const access = rowAccess(r.source);
              const editable = access !== "read-only" && reason === undefined;
              return (
                <tr key={r.isNew ? `new-${i}` : r.key}>
                  <th scope="row">
                    {r.isNew && reason === undefined ? (
                      <TextInput
                        aria-label="New tag key"
                        value={r.key}
                        onChange={(e) => set(i, { key: e.target.value })}
                      />
                    ) : (
                      <code>{r.key}</code>
                    )}
                  </th>
                  <td>
                    {editable ? (
                      <TextInput
                        aria-label={`Value of ${r.key || "the new tag"}`}
                        aria-invalid={problems[i] !== undefined}
                        value={r.value}
                        onChange={(e) => set(i, { value: e.target.value })}
                      />
                    ) : (
                      r.value || "—"
                    )}
                    {problems[i] && dirty && <div role="alert">{problems[i]}</div>}
                  </td>
                  <td>
                    <Badge tone={TONE[r.source as keyof typeof TONE] ?? "grey"}>
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </Badge>
                  </td>
                  <td>
                    {access === "own" && (
                      <Button
                        aria-label={`Remove ${r.key}`}
                        disabledReason={reason}
                        onClick={() => setRows((x) => x?.filter((_, j) => j !== i))}
                      >
                        Remove
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          <Button
            disabledReason={reason}
            onClick={() =>
              setRows((r) => [
                ...(r ?? []),
                { key: "", source: "team", value: "", original: "", isNew: true },
              ])
            }
          >
            Add tag
          </Button>{" "}
          <Button
            variant="primary"
            disabledReason={reason}
            disabled={!dirty || save.isPending || Object.keys(problems).length > 0}
            onClick={() => save.mutate()}
          >
            Save tags
          </Button>
        </div>
      </Card>
    </div>
  );
}
