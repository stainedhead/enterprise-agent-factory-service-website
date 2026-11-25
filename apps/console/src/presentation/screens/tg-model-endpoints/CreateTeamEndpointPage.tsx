import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAppError } from "../../../application/errors.js";
import {
  createTeamModelEndpointCli,
  type EndpointDraft,
  emptyEndpointDraft,
  TEAM_ENDPOINTS_NOT_ALLOWED,
  unpricedModels,
  validateEndpoint,
} from "../../../domain/modelEndpoints.js";
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CliPreview,
  PageHeader,
} from "../../components/index.js";
import { gate } from "../../hooks/gate.js";
import { areaKey } from "../../query/keys.js";
import { useService } from "../../services.js";
import { useMe } from "../../shell/ShellContext.js";
import { EndpointFields } from "../sg-model-endpoints/EndpointFields.js";
import { AREA, ErrorAlert } from "../sg-model-endpoints/shared.js";
import { useTeamRoutes } from "./RouteTables.js";

/** TG2 (screen 62, MEG-WEB-3): a team declares its own endpoint, for example vLLM in its namespace. */
export function CreateTeamEndpointPage() {
  const { teamId = "" } = useParams();
  const uc = useService("teamModelEndpoints");
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const routes = useTeamRoutes(teamId);
  const [draft, setDraft] = useState<EndpointDraft>(emptyEndpointDraft("team"));
  const [touched, setTouched] = useState(false);
  const r = routes.data;
  const taken = r ? [...r.selected, ...r.own, ...r.available].map((e) => e.slug) : [];
  const errors = validateEndpoint(draft, "team", taken);
  const create = useMutation({
    mutationFn: () => uc.create(teamId, draft, taken),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: areaKey(AREA) });
      navigate(`/t/${teamId}/model-endpoints`);
    },
  });
  const apiErr = isAppError(create.error) ? create.error : undefined;
  const blocked =
    gate(me, "model-endpoints:write", teamId) ??
    (r && !r.mayAddModelEndpoints ? TEAM_ENDPOINTS_NOT_ALLOWED : undefined);
  const shown = touched ? { ...errors, ...(apiErr?.fields ?? {}) } : (apiErr?.fields ?? {});
  const unpriced = unpricedModels(draft);
  return (
    <div>
      <Breadcrumbs
        crumbs={[
          { label: "Agent Factory", to: "/" },
          { label: "Team", to: `/t/${teamId}` },
          { label: "Model endpoints", to: `/t/${teamId}/model-endpoints` },
          { label: "Create endpoint" },
        ]}
        renderLink={(c) => <Link to={c.to ?? "/"}>{c.label}</Link>}
      />
      <PageHeader
        title="Create endpoint"
        description="An OpenAI-compatible model service only this team's agents call, through the team gateway. Every call is metered."
        infoHref="/docs/model-endpoints"
      />
      {r && !r.mayAddModelEndpoints && (
        <Alert kind="info" title={TEAM_ENDPOINTS_NOT_ALLOWED}>
          A service admin allows a team to declare its own endpoints on the team's page.
        </Alert>
      )}
      <ErrorAlert
        errors={[
          routes.error,
          apiErr && Object.keys(apiErr.fields).length === 0 ? apiErr : undefined,
        ]}
        title="The endpoint was not created"
      />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (!blocked && Object.keys(errors).length === 0) create.mutate();
        }}
      >
        <Card title="Endpoint">
          <EndpointFields
            scope="team"
            part="endpoint"
            draft={draft}
            errors={shown}
            onChange={setDraft}
          />
        </Card>
        <Card title="Access">
          <EndpointFields
            scope="team"
            part="access"
            draft={draft}
            errors={shown}
            onChange={setDraft}
          />
        </Card>
        <Card title="Models & pricing">
          <EndpointFields
            scope="team"
            part="models"
            draft={draft}
            errors={shown}
            onChange={setDraft}
          />
          {unpriced.length > 0 && (
            <Alert kind="warning" title="Not callable until priced">
              {unpriced.join(", ")} have no price; calls to them are refused.
            </Alert>
          )}
        </Card>
        <CliPreview command={createTeamModelEndpointCli(teamId, draft)} />
        <p>
          <Button onClick={() => navigate(`/t/${teamId}/model-endpoints`)}>Cancel</Button>{" "}
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending}
            disabledReason={blocked}
          >
            Create endpoint
          </Button>
        </p>
      </form>
    </div>
  );
}
