/** Seeded principals shared by the fake IdP and the fake AFS API. The access token names the user. */
export type SeedUserId = "svc-admin" | "team-admin" | "viewer" | "collaborator" | "sec-op";

export interface SeedUser {
  readonly id: SeedUserId;
  readonly subject: string;
  readonly email: string;
  readonly name: string;
}

export const SEED_USERS: readonly SeedUser[] = [
  {
    id: "svc-admin",
    subject: "sub-svc-admin",
    email: "svc.admin@example.test",
    name: "Sam Service",
  },
  {
    id: "team-admin",
    subject: "sub-team-admin",
    email: "team.admin@example.test",
    name: "Tia Teamadmin",
  },
  { id: "viewer", subject: "sub-viewer", email: "viewer@example.test", name: "Vic Viewer" },
  {
    id: "collaborator",
    subject: "sub-collaborator",
    email: "collaborator@example.test",
    name: "Cory Collaborator",
  },
  { id: "sec-op", subject: "sub-sec-op", email: "sec.op@example.test", name: "Sec Operator" },
];

export const userById = (id: string): SeedUser | undefined => SEED_USERS.find((u) => u.id === id);

/** Access tokens are `at.<userId>.<n>` so the fake API can resolve the principal without a database. */
export const principalFromToken = (token: string): SeedUser | undefined => {
  const m = /^at\.([a-z-]+)\.\d+$/.exec(token);
  return m?.[1] ? userById(m[1]) : undefined;
};
