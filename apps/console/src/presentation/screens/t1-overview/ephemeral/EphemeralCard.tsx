import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ephemeralStatus } from "../../../../application/usecases/teams/ephemeral.js";
import { can } from "../../../../domain/me.js";
import { format } from "../../../../domain/money.js";
import { formatLocal, utcTitle } from "../../../../domain/time.js";
import { Card, KeyValue } from "../../../components/index.js";
import { teamKey } from "../../../hooks/useTeamWriteGate.js";
import { queryKey } from "../../../query/keys.js";
import { useService } from "../../../services.js";
import { useMe } from "../../../shell/ShellContext.js";

const RULE = {
  at_cap_or_expiry: "At the cap or at expiry, whichever comes first",
  at_expiry: "At expiry only",
} as const;

/** The ephemeral team card on T1 and V1 (WEB-US-38.3): time to expiry, spend against the cap, teardown. */
export function EphemeralCard({ teamId }: { teamId: string }) {
  const me = useMe();
  const teams = useService("teams");
  const overview = useService("overview");
  const [now] = useState(() => new Date());
  const t = useQuery({
    queryKey: teamKey(teamId),
    queryFn: ({ signal }) => teams.get(teamId, signal),
  });
  const budget = useQuery({
    queryKey: queryKey({ area: "overview", teamId, resource: "budget" }),
    queryFn: ({ signal }) => overview.budgetBurn(teamId, signal),
    enabled: can(me, "budgets:read", teamId),
  });
  const team = t.data;
  if (!team || team.kind !== "ephemeral") return null;
  const st = ephemeralStatus(team, now);
  const rule = RULE[team.teardownRule as keyof typeof RULE] ?? team.teardownRule ?? "—";
  return (
    <Card title="Ephemeral team">
      <KeyValue
        items={[
          {
            label: "Expires",
            value: team.expiresAt ? (
              <span>
                <time dateTime={team.expiresAt} title={utcTitle(team.expiresAt)}>
                  {formatLocal(team.expiresAt)}
                </time>
                {!st.tornDown && st.daysLeft !== undefined && (
                  <> · {st.daysLeft === 0 ? "due now" : `${st.daysLeft} days left`}</>
                )}
              </span>
            ) : (
              "—"
            ),
          },
          {
            label: "Spend against the cap",
            value: budget.data
              ? `${format(budget.data.budget.spentUsd)} of ${format(budget.data.budget.amountUsd)} (${Math.round(budget.data.percent)}%)`
              : can(me, "budgets:read", teamId)
                ? "Loading…"
                : "You cannot view the budget",
          },
          { label: "Teardown", value: rule },
          ...(st.tornDown
            ? [
                {
                  label: "Torn down",
                  value: (
                    <span>
                      {st.tornDownAt ? (
                        <time dateTime={st.tornDownAt} title={utcTitle(st.tornDownAt)}>
                          {formatLocal(st.tornDownAt)}
                        </time>
                      ) : (
                        "—"
                      )}
                      {st.reason && <> · {st.reason}</>}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />
    </Card>
  );
}
