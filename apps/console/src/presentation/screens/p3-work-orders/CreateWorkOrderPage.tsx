import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { isAppError } from "../../../application/errors.js";
import { directoryLabel } from "../../../application/usecases/teamDirectory/TeamDirectoryUseCases.js";
import {
  emptyRepo,
  ownerProblems,
  prefillOwners,
  type RepoDraft,
  repoArg,
  SEVERITIES,
  validateWorkOrder,
  type WorkOrderDraft,
} from "../../../application/usecases/workOrders/WorkOrdersUseCases.js";
import { buildCli, type CliCommand } from "../../../domain/cli.js";
import { label } from "../../../domain/labels.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  FormField,
  PageHeader,
  SelectInput,
  TextInput,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";

const EMPTY: WorkOrderDraft = {
  kind: "cve_remediation",
  cveId: "",
  severity: "high",
  title: "",
  slaDueAt: "",
  templateId: "",
  budgetUsd: "",
  repos: [emptyRepo],
};

/** The CLI command equivalent to the form as it stands (WEB-6): `create-work-order` with `--repos` owners. */
export function cliForWorkOrder(d: WorkOrderDraft): CliCommand {
  const cmd = buildCli("CreateWorkOrder", {
    kind: d.kind,
    cveId: d.kind === "cve_remediation" ? d.cveId || "<cve-id>" : undefined,
    severity: d.severity,
    title: d.title || "<title>",
    slaDueAt: d.slaDueAt ? new Date(d.slaDueAt).toISOString() : "<sla-due-at>",
    templateId: d.templateId || "<template-id>",
    budgetUsd: d.budgetUsd || undefined,
    repos: ["x"],
  });
  const repos = d.repos.map((r) => repoArg({ ...r, ref: r.ref.trim() || "<host/owner/repo>" }));
  return { ...cmd, args: cmd.args.map(([f, v]) => (f === "repos" ? [f, repos] : [f, v])) };
}

/**
 * *Create work order* (WEB-US-40.2 to 40.4): CVE, severity, SLA, an enabled template, a cap and the repositories,
 * each with an owner picker. A refused create that names ambiguous repositories pre-fills their pickers.
 */
export function CreateWorkOrderPage() {
  const uc = useService("workOrders");
  const templates = useService("swarmTemplates");
  const directory = useService("teamDirectory");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reason = gate(me, "work-orders:write");
  const [d, setD] = useState<WorkOrderDraft>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [unowned, setUnowned] = useState<ReadonlySet<string>>(new Set());
  const [ambiguous, setAmbiguous] = useState<ReadonlyMap<string, readonly string[]>>(new Map());

  const tq = useQuery({
    queryKey: queryKey({ area: "swarmTemplates", resource: "enabled" }),
    queryFn: ({ signal }) => templates.enabled(signal),
  });
  const dir = useQuery({
    queryKey: queryKey({ area: "teamDirectory", resource: "list" }),
    queryFn: ({ signal }) => directory.list(signal),
    retry: false,
  });
  const enabledIds = (tq.data ?? []).map((t) => t.id);
  const errors = validateWorkOrder(d, enabledIds);

  const create = useMutation({
    mutationFn: () => uc.create(d, enabledIds),
    onSuccess: (w) => {
      void qc.invalidateQueries({ queryKey: ["workOrders"] });
      navigate(`/work-orders/${w.id}`, { state: { created: w.repos } });
    },
    onError: (e) => {
      const p = ownerProblems(e);
      if (p) {
        setUnowned(p.unowned);
        setAmbiguous(p.ambiguous);
        setD((x) => ({ ...x, repos: [...prefillOwners(x.repos, p)] }));
      }
    },
  });
  const err = create.error && isAppError(create.error) ? create.error : undefined;
  const conflict = err?.kind === "conflict";
  const existing = useQuery({
    queryKey: queryKey({ area: "workOrders", resource: "open-for-cve", id: d.cveId }),
    queryFn: ({ signal }) => uc.openForCve(d.cveId.trim(), signal),
    enabled: conflict && d.cveId.trim() !== "",
    retry: false,
  });
  const serverFields = err?.kind === "validation" ? err.fields : {};
  const fieldErr = (k: string) => (touched ? errors[k] : undefined) ?? serverFields[k];

  const set = <K extends keyof WorkOrderDraft>(k: K, v: WorkOrderDraft[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const setRepo = (i: number, patch: Partial<RepoDraft>) =>
    setD((x) => ({ ...x, repos: x.repos.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length === 0) create.mutate();
  };

  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Work orders", to: "/work-orders" },
          { label: "Create work order" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Create work order"
        description="Assign remediation across repositories; each repository is routed to its owning team."
      />
      {err && !ownerProblems(err) && (
        <Alert
          kind="error"
          title={
            err.isAccessDenied
              ? "You do not have access"
              : conflict
                ? "A work order for this CVE is already open"
                : "The work order was not created"
          }
          requestId={err.requestId}
        >
          {err.message}
          {conflict && existing.data && (
            <>
              {" "}
              <Link to={`/work-orders/${existing.data.id}`}>Open {existing.data.title}</Link>
            </>
          )}
        </Alert>
      )}
      {(unowned.size > 0 || ambiguous.size > 0) && (
        <Alert kind="warning" title="Some repositories need an owner">
          {unowned.size > 0 && (
            <p>No team configuration owns: {[...unowned].join(", ")}. Choose an owner for each.</p>
          )}
          {ambiguous.size > 0 && (
            <p>
              More than one team claims: {[...ambiguous.keys()].join(", ")}. The first candidate is
              chosen; change it if another team should own the repository.
            </p>
          )}
        </Alert>
      )}
      <Card title="Work order">
        <FormField label="Kind" error={fieldErr("kind")}>
          <SelectInput
            value={d.kind}
            onChange={(e) => set("kind", e.target.value as WorkOrderDraft["kind"])}
            options={[
              { value: "cve_remediation", label: "CVE remediation" },
              { value: "general", label: "General" },
            ]}
          />
        </FormField>
        {d.kind === "cve_remediation" && (
          <FormField label="CVE" hint="For example CVE-2026-1234" error={fieldErr("cveId")}>
            <TextInput value={d.cveId} onChange={(e) => set("cveId", e.target.value)} />
          </FormField>
        )}
        <FormField label="Title" error={fieldErr("title")}>
          <TextInput value={d.title} onChange={(e) => set("title", e.target.value)} />
        </FormField>
        <FormField label="Severity" error={fieldErr("severity")}>
          <SelectInput
            value={d.severity}
            onChange={(e) => set("severity", e.target.value)}
            options={SEVERITIES.map((s) => ({ value: s, label: label("severity", s) }))}
          />
        </FormField>
        <FormField label="SLA due" error={fieldErr("slaDueAt")}>
          <TextInput
            type="datetime-local"
            value={d.slaDueAt}
            onChange={(e) => set("slaDueAt", e.target.value)}
          />
        </FormField>
        <FormField
          label="Template"
          hint="Only enabled templates are offered"
          error={fieldErr("templateId")}
        >
          <SelectInput
            value={d.templateId}
            onChange={(e) => set("templateId", e.target.value)}
            placeholder="Choose a template"
            options={(tq.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
          />
        </FormField>
        <FormField
          label="Spend cap (USD)"
          hint="Leave empty for the template's cap"
          error={fieldErr("budgetUsd")}
        >
          <TextInput
            inputMode="decimal"
            value={d.budgetUsd}
            onChange={(e) => set("budgetUsd", e.target.value)}
          />
        </FormField>
      </Card>
      <Card
        title="Repositories"
        actions={
          <Button onClick={() => set("repos", [...d.repos, emptyRepo])}>Add repository</Button>
        }
      >
        {fieldErr("repos") && <Alert kind="error" title={fieldErr("repos") as string} />}
        {d.repos.map((r, i) => {
          const key = `repo-${i}`;
          const marked = unowned.has(r.ref.trim());
          return (
            <fieldset key={key}>
              <legend className="sr-only">Repository {i + 1} owner and contact</legend>
              <FormField
                label={`Repository ${i + 1}`}
                hint={
                  marked ? "Needs an owner: choose a team or enter an email" : "host/owner/repo"
                }
                error={fieldErr(`repos.${i}.ref`)}
              >
                <TextInput
                  value={r.ref}
                  onChange={(e) => setRepo(i, { ref: e.target.value })}
                  aria-invalid={marked || undefined}
                />
              </FormField>
              <FormField label={`Owning team for repository ${i + 1}`}>
                <SelectInput
                  value={r.teamId}
                  onChange={(e) => setRepo(i, { teamId: e.target.value })}
                  placeholder="Team configuration decides"
                  options={(dir.data ?? [])
                    .filter(
                      (t) =>
                        !ambiguous.has(r.ref.trim()) ||
                        (ambiguous.get(r.ref.trim()) ?? []).includes(t.id) ||
                        t.id === r.teamId,
                    )
                    .map((t) => ({ value: t.id, label: directoryLabel(t) }))}
                />
              </FormField>
              <FormField
                label={`Owning contact for repository ${i + 1}`}
                error={fieldErr(`repos.${i}.email`)}
              >
                <TextInput
                  type="email"
                  value={r.email}
                  onChange={(e) => setRepo(i, { email: e.target.value })}
                />
              </FormField>
              {d.repos.length > 1 && (
                <Button
                  aria-label={`Remove repository ${i + 1}`}
                  onClick={() =>
                    set(
                      "repos",
                      d.repos.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </Button>
              )}
            </fieldset>
          );
        })}
      </Card>
      <CliPreview command={cliForWorkOrder(d)} />
      <div>
        <Button onClick={() => navigate("/work-orders")}>Cancel</Button>
        <Button
          variant="primary"
          disabledReason={reason}
          disabled={create.isPending}
          onClick={submit}
        >
          Create work order
        </Button>
      </div>
    </div>
  );
}
