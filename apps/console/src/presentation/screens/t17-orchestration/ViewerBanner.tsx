import { useQuery } from "@tanstack/react-query";
import { queryKey } from "../../query/keys.js";
import { useOptionalService } from "../../services.js";

/** Up to three team-admin names for the V3 banner, then "and N more" (WEB-US-51). */
export function adminNames(
  members: readonly { role: string; email?: string | undefined; groupName?: string | undefined }[],
): string | undefined {
  const names = members
    .filter((m) => m.role === "team_admin")
    .map((m) => m.email ?? m.groupName)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return undefined;
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

/** The V3 information banner: a labelled region, not an alert. A failing member list omits the names. */
export function ViewerBanner({ teamId }: { teamId: string }) {
  const members = useOptionalService("members");
  const q = useQuery({
    queryKey: queryKey({ area: "collaboration", teamId, resource: "admins" }),
    queryFn: ({ signal }) =>
      members ? members.list(teamId, signal) : Promise.reject(new Error("no members service")),
    enabled: members !== undefined,
    retry: false,
  });
  const names = q.data ? adminNames(q.data) : undefined;
  return (
    <section
      aria-label="Read-only access"
      style={{ margin: "8px 0", padding: 12, border: "1px solid var(--afs-border, #aab7b8)" }}
    >
      You have read-only access to this page. You can open the collaboration tool and see how it is
      set up. Team-admins{names ? ` (${names})` : ""} change the endpoints and connections. Your
      role decides what you can do inside the tool: viewers read, collaborators also write.
    </section>
  );
}
