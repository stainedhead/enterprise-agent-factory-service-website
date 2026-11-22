import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ExternalSystemRecord } from "../../../application/ports/externalSystems.js";
import { Alert, Button, FormField, Modal, SelectInput, TextInput } from "../../components/index.js";
import { useService } from "../../services.js";

export const CATEGORIES = [
  "dev_tools",
  "collaboration",
  "email",
  "cloud",
  "identity",
  "llm",
  "other",
].map((c) => ({ value: c, label: c.replace("_", " ") }));

/** *Declare system* and the edit of a team-declared one (WEB-US-32.2). */
export function SystemDialog({
  teamId,
  existing,
  onClose,
  onSaved,
}: {
  teamId: string;
  existing: ExternalSystemRecord | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const systems = useService("externalSystems");
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [category, setCategory] = useState(existing?.category ?? "other");
  const [owner, setOwner] = useState(existing?.owner ?? "");
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [endpoints, setEndpoints] = useState((existing?.endpoints ?? []).join(", "));
  const [err, setErr] = useState<ReturnType<typeof asError>>();
  const [pending, setPending] = useState(false);
  const eps = endpoints
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const submit = async () => {
    setPending(true);
    try {
      if (existing)
        await systems.updateTeam(
          teamId,
          { id: existing.id, version: existing.version },
          { name, owner, purpose, endpoints: eps },
        );
      else await systems.declare(teamId, { name, slug, category, owner, purpose, endpoints: eps });
      onSaved();
    } catch (e) {
      setErr(asError(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Declare system"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            {existing ? "Save" : "Declare system"}
          </Button>
        </>
      }
    >
      {err && !err.isAccessDenied && Object.keys(err.fields).length === 0 && (
        <Alert kind="error" title="The system was not saved" requestId={err.requestId}>
          {err.message}
        </Alert>
      )}
      <FormField label="Name" error={err?.fields.name}>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </FormField>
      {!existing && (
        <>
          <FormField label="Slug" error={err?.fields.slug}>
            <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} />
          </FormField>
          <FormField label="Category" error={err?.fields.category}>
            <SelectInput
              value={category}
              options={CATEGORIES}
              onChange={(e) => setCategory(e.target.value)}
            />
          </FormField>
        </>
      )}
      <FormField label="Owner" error={err?.fields.owner}>
        <TextInput value={owner} onChange={(e) => setOwner(e.target.value)} />
      </FormField>
      <FormField label="Purpose" error={err?.fields.purpose}>
        <TextInput value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </FormField>
      <FormField
        label="Endpoints"
        hint="Comma-separated hosts, for example ci.example.com, *.build.example.com"
        error={err?.fields.endpoints}
      >
        <TextInput value={endpoints} onChange={(e) => setEndpoints(e.target.value)} />
      </FormField>
    </Modal>
  );
}

function asError(e: unknown) {
  if (isAppError(e)) return e;
  throw e;
}
