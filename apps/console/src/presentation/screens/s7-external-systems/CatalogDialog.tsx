import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import type { ExternalSystemRecord } from "../../../application/ports/externalSystems.js";
import { Alert, Button, FormField, Modal, SelectInput, TextInput } from "../../components/index.js";
import { useService } from "../../services.js";
import { CATEGORIES } from "../t9-external-systems/SystemDialogs.js";

/** Add a catalog system or edit one (WEB-US-18.1). */
export function CatalogDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: ExternalSystemRecord | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const catalog = useService("adminExternalSystems");
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [category, setCategory] = useState(existing?.category ?? "other");
  const [endpoints, setEndpoints] = useState((existing?.endpoints ?? []).join(", "));
  const [docsUrl, setDocsUrl] = useState(existing?.docsUrl ?? "");
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const err = isAppError(error) ? error : undefined;
  const eps = endpoints
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const submit = async () => {
    setPending(true);
    try {
      if (existing)
        await catalog.update(existing, { name, endpoints: eps, docsUrl: docsUrl || undefined });
      else
        await catalog.create({
          name,
          slug,
          category,
          endpoints: eps,
          docsUrl: docsUrl || undefined,
        });
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : "Add system"}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={pending} onClick={submit}>
            {existing ? "Save" : "Add system"}
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
      <FormField
        label="Endpoints"
        hint="Comma-separated hosts, for example api.example.com, *.example.com"
        error={err?.fields.endpoints}
      >
        <TextInput value={endpoints} onChange={(e) => setEndpoints(e.target.value)} />
      </FormField>
      <FormField label="Documentation URL" hint="Optional, https only" error={err?.fields.docsUrl}>
        <TextInput value={docsUrl} onChange={(e) => setDocsUrl(e.target.value)} />
      </FormField>
    </Modal>
  );
}
