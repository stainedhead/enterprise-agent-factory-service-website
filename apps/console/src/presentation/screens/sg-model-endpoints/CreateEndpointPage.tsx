import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  authWord,
  createModelEndpointCli,
  type EndpointDraft,
  emptyEndpointDraft,
  locationWord,
  pricingWord,
  protocolWords,
  unpricedModels,
  validateEndpoint,
} from "../../../domain/modelEndpoints.js";
import {
  Alert,
  Breadcrumbs,
  CliPreview,
  KeyValue,
  PageHeader,
  Wizard,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { EndpointFields } from "./EndpointFields.js";
import { AREA, catalogKey, ErrorAlert } from "./shared.js";

/** SG2 (screen 57, MEG-WEB-2): *Create endpoint*. It is created off; prices go in with it. */
export function CreateEndpointPage() {
  const uc = useService("adminModelEndpoints");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EndpointDraft>(emptyEndpointDraft("service"));
  const catalog = useQuery({ queryKey: catalogKey, queryFn: ({ signal }) => uc.catalog(signal) });
  const taken = [...(catalog.data?.service ?? []), ...(catalog.data?.team ?? [])].map(
    (e) => e.slug,
  );
  const errors = validateEndpoint(draft, "service", taken);
  const create = useMutation({
    mutationFn: () => uc.create(draft, taken),
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      navigate(`/model-endpoints/${e.id}`);
    },
  });
  const apiErr = isAppError(create.error) ? create.error : undefined;
  const denied = gate(me, "admin:model-endpoints");
  const endpointOk = !(
    errors.slug ||
    errors.displayName ||
    errors.baseUrl ||
    errors.protocols ||
    errors.location
  );
  const unpriced = unpricedModels(draft);
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Model endpoints", to: "/model-endpoints" },
          { label: "Create endpoint" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Create endpoint"
        description="An OpenAI-compatible model service. It is created switched off; turn it on to offer it to teams."
        infoHref="/docs/model-endpoints"
      />
      {denied && (
        <Alert kind="info" title={denied}>
          Only a service admin creates service endpoints.
        </Alert>
      )}
      <ErrorAlert
        errors={[apiErr && Object.keys(apiErr.fields).length === 0 ? apiErr : undefined]}
      />
      <Wizard
        steps={[
          {
            id: "endpoint",
            title: "Endpoint",
            valid: endpointOk,
            content: (
              <EndpointFields
                scope="service"
                part="endpoint"
                draft={draft}
                errors={{ ...errors, ...(apiErr?.fields ?? {}) }}
                onChange={setDraft}
              />
            ),
          },
          {
            id: "access",
            title: "Access",
            valid: !errors.authHeader,
            content: (
              <EndpointFields
                scope="service"
                part="access"
                draft={draft}
                errors={errors}
                onChange={setDraft}
              />
            ),
          },
          {
            id: "models",
            title: "Models & pricing",
            valid: !errors.models,
            content: (
              <EndpointFields
                scope="service"
                part="models"
                draft={draft}
                errors={errors}
                onChange={setDraft}
              />
            ),
          },
        ]}
        review={
          <>
            <KeyValue
              items={[
                { label: "Route", value: <code>{draft.slug}</code> },
                { label: "Display name", value: draft.displayName },
                { label: "Location", value: locationWord(draft.location) },
                { label: "Provider", value: draft.provider },
                { label: "Base URL", value: <code>{draft.baseUrl}</code> },
                { label: "Protocols", value: protocolWords(draft.protocols) },
                { label: "Authentication", value: authWord(draft.authKind) },
                {
                  label: "Credential",
                  value: draft.credentialMode === "shared" ? "Shared" : "Per team",
                },
                { label: "Extra terms", value: draft.requiresTerms ? "Yes" : "No" },
                { label: "Pricing", value: pricingWord(draft.pricingMode) },
                {
                  label: "Models",
                  value: draft.models.map((m) => m.modelName).join(", ") || "None yet",
                },
              ]}
            />
            {unpriced.length > 0 && (
              <Alert kind="warning" title="Not callable until priced">
                {unpriced.join(", ")} have no price yet. They are saved, but calls are refused until
                a price is approved.
              </Alert>
            )}
            <CliPreview command={createModelEndpointCli(draft)} />
          </>
        }
        submitLabel={create.isPending ? "Creating…" : "Create endpoint"}
        onSubmit={() => {
          if (denied === undefined && Object.keys(errors).length === 0) create.mutate();
        }}
        onCancel={() => navigate("/model-endpoints")}
      />
    </div>
  );
}
