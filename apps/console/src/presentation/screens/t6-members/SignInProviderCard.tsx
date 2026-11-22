import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAppError } from "../../../application/errors.js";
import { Alert, Button, Card, FormField, SelectInput } from "../../components/index.js";
import { teamKey, useTeamWriteGate } from "../../hooks/useTeamWriteGate.js";
import { ConflictAlert } from "../../query/ConflictAlert.js";
import { queryKey } from "../../query/keys.js";
import { useService } from "../../services.js";

/** The team's sign-in provider; team-admins change it among the enabled providers (WEB-US-29.4). */
export function SignInProviderCard({ teamId }: { teamId: string }) {
  const teams = useService("teams");
  const providers = useService("signInProviders");
  const qc = useQueryClient();
  const write = useTeamWriteGate(teamId);
  const team = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const list = useQuery({
    queryKey: queryKey({ area: "members", resource: "sign-in-providers" }),
    queryFn: () => providers.execute(),
  });
  const [choice, setChoice] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: (id: string) => {
      if (!team.data) throw new Error("team not loaded");
      return teams.update(team.data, { identityProviderId: id });
    },
    onSuccess: () => {
      setChoice(undefined);
      void qc.invalidateQueries({ queryKey: teamKey(teamId) });
    },
  });
  const all = list.data?.providers ?? [];
  const current = team.data?.identityProviderId;
  const currentName =
    all.find((p) => p.id === current)?.name ?? (current ? current : "Service default");
  const value = choice ?? current ?? "";
  const err = isAppError(save.error) ? save.error : undefined;

  return (
    <Card title="Sign-in provider">
      {err?.kind === "stale" ? (
        <ConflictAlert
          onReload={() => {
            save.reset();
            void qc.invalidateQueries({ queryKey: teamKey(teamId) });
          }}
          requestId={err.requestId}
        />
      ) : (
        err &&
        !err.isAccessDenied && (
          <Alert kind="error" requestId={err.requestId}>
            {err.message}
          </Alert>
        )
      )}
      <p>
        People sign in to this team with <strong>{currentName}</strong>.
      </p>
      {all.length > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
          <FormField label="Change sign-in provider" hint="Among the enabled providers">
            <SelectInput
              value={value}
              placeholder="Service default"
              options={all.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(e) => setChoice(e.target.value)}
            />
          </FormField>
          <Button
            disabledReason={write.reasonFor("teams:write")}
            disabled={save.isPending || choice === undefined || choice === "" || choice === current}
            onClick={() => choice && save.mutate(choice)}
          >
            Save provider
          </Button>
        </div>
      )}
    </Card>
  );
}
