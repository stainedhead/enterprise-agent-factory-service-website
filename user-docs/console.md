# Using the Agent Factory console

The console is the web front end of the Agent Factory Service. What you see depends on your role: service
admins see every team and the service settings, team admins see their own teams, team viewers can read but
not change. A control you may not use is shown disabled with a tooltip such as "Requires team-admin"; an
admin-only area is not shown to team roles at all. The API makes the final decision on every change.

Every create form shows the equivalent `afs` command, so you can script what you just did.

## Service dashboard (`/`, service admins)

Team and agent counts, this month's spend against the sum of team budgets, reconciler health and the five
biggest spenders, each linking to its team. **Teams needing attention** lists teams that expire within 7
days, use 80% or more of their budget, are *Budget blocked*, have *Degraded* agents or had drift reverted in
the last 24 hours, with the reason for each. A yellow banner appears when team-days are over the cost
variance threshold or model price proposals are waiting. Agent counts cover the first 50 active teams.

## Teams (`/teams`, service admins)

The table shows state, spend against budget, cost center and, for ephemeral teams, the expiry. Select a team
and use **Actions** to suspend, resume, set a ceiling, raise it temporarily or delete (you type the slug).
**Create team** opens a wizard with a review step that prints the `afs teams create-team` command. A new
team shows *Reconciling* and turns *Ready* without a reload.

## Team overview (`/t/<team>`)

Namespace, IAM role, cost center, conditions, budget burn, agent health, recent activity and work orders;
each card loads on its own, so one failing card does not hide the rest. The **Models** tab
(`?tab=models`) lists the team's enabled models; only service admins edit them. **Edit** changes the display
name, description, owner and sign-in provider; if someone changed the team meanwhile you are asked to reload
and your edits stay in the form. While a team is suspended a banner says so and every change is disabled
except *Resume*. Team viewers get the same page with a read-only notice.

## Members and API keys (`/t/<team>/members`)

Add a person by email or an IdP group as team admin or team viewer; change a role; remove. The team's
sign-in provider is shown and team admins can change it among the enabled providers. **API keys** (team
admins and service admins only) creates a key with a name, a role and an expiry of up to 90 days (30 by
default). The secret is shown once; copy it before you close the dialog. If a retry returns the key without
its secret, the dialog says so and offers **Delete key** so you can create a new one.

## Agents (`/t/<team>/agents`)

The team's agents with status, model, template, secret count and month-to-date cost; one list request per
polling interval. Select an agent for its panel: **Restart**, **Pause** or **Resume** (with a confirmation),
**Take snapshot**, **Edit** and **Expand volume** (grow-only). Tabs show details, where logs are delivered,
revisions and external systems. A template that was retired shows *Template retired*. Viewers see the same
panel with every action disabled "Requires team-admin".

## Create agent (`/t/<team>/agents/new`)

One page with sections for the agent, model and resources, storage, identity, configuration values and secret
bindings, plus a help panel and the equivalent `afs` commands. The persona is sent as the description. Secret
bindings pick existing secrets by name; values are never typed here. A configuration value whose name looks
like a credential is refused: store it under Secrets.

## Secrets (`/t/<team>/secrets`)

Names, scope, the managed Secrets Manager path, which agents use each secret, rotation and last change.
**Create secret** and **Rotate** take a value in a password field that is sent once and cleared; the console
never shows it again (the column reads *Write-only*). Deleting a secret agents use is refused and links to
those agents. Team viewers get the same table without values or actions.

## Configuration values (`/t/<team>/config`)

Non-secret namespace values shared by the team's agents, with the agents using each; below, an agent's values
showing whether each is its own or the namespace's and what the agent receives. Saving a value agents use
warns which agents restart; a value agents use cannot be deleted. Names are UPPER_SNAKE_CASE and
credential-like names are refused with a link to Secrets.

## External systems (`/t/<team>/external-systems`, agent tab, `/external-systems`)

Each team switch shows inherited state: a system off at the service level is shown off and locked, with the
level named. Unmetered systems carry an *Unmetered* badge. **Declare system** is enabled only for teams a
service admin allowed to declare their own. The agent's **External systems** tab switches a system off for
that agent only (*Off at agent level*). Service admins manage the catalog at `/external-systems`: built-in
systems cannot be deleted, a service switch turns a system off for every team, enabling an unmetered system
asks for confirmation, and a list below chooses which teams may declare their own systems.

## Storage classes and agent templates (`/settings/storage-classes`, `/settings/agent-templates`)

Service admins add, edit, enable or disable and remove storage classes and agent templates (harness, default
resources, allowed digests with one current). A class or template agents still use cannot be removed.

## Service settings (`/settings/general`, service admins)

**Settings** lists every key with its value, default, allowed range and last change; **Edit** checks the
range before sending. **Identity providers** adds, edits, disables and sets the default Okta or Entra ID
provider; select a provider to see the teams using it. A provider in use cannot be disabled. A client secret
is never entered in the console: give the ARN of its Secrets Manager secret; only the ARN is shown.

## History (`/t/<team>/history/audit`, `/t/<team>/history/revisions`)

**Activity & audit** lists who did what, with outcome and request id. Filter by period, actor, action,
outcome and resource; the filter is in the URL, so you can share it. **Download CSV** saves everything that
matches. **Config revisions** lists revisions per resource; tick two revisions of the same resource to see
what changed between them.

## Troubleshooting

- *Page not found* for a page you expect: you may not hold the role it needs, or the team is not yours.
- A banner at the top says the service is unavailable or throttling: the console retries; nothing is lost.
- "Change not applied yet" next to a team or agent: the reconciler has not caught up with your change.
