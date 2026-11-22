# Console usage examples

Task walkthroughs. Screen-by-screen detail is in [console.md](console.md). Every create form shows the equivalent
`afs` command under *Copy command*; the commands below are what those forms produce, with placeholder ids.

## Sign in and check your role

Open the console, pick a sign-in provider and sign in. The header shows your role and team. If a control is
disabled, hover it: the tooltip names the role required. If the console says you lack access, the API refused the
request; ask a team admin or a service admin.

## Service admin: create a team and invite its first admin

1. *Teams*, then *Create team*. Fill the wizard (name, budget, cost tags) and review on the last step.
2. Confirm. The team shows *Change not applied yet* until the reconciler catches up, then *Ready*.
3. Open the team, *Members and API keys*, and add the team admin.

```bash
afs teams create-team --name payments --max-budget-usd 5000
afs members add-member --team-id team_01... --email dev@example.com --role team-admin
```

## Team admin: create an agent with a secret

1. *Secrets*, *Create secret*. Choose the value source: a file, or type it in the field. The value is sent once and
   is never shown again; only the name, reference and metadata are listed.
2. *Agents*, *Create agent*. Pick the template, model and resources, attach the secret and configuration values,
   review and create.
3. Open the agent panel to follow its status, logs and identity.

```bash
afs agents create-agent --team-id team_01... --name triage --template-id tpl_01...
```

## Watch and cap spend

*Budget and usage* shows the cap, month-to-date spend and thresholds. Change thresholds with *Edit budget*. *Reports*
gives cost and usage by day, model or agent, reconciles cost against the billing source and downloads CSV. *Schedule
report* sends a report to a notification channel.

## Restore an earlier configuration

*History*, *Config revisions*, pick a revision and *Restore*. Review the diff, confirm, then wait for *Ready*.
Restore is a normal change: it is audited and can be restored again.

## Ephemeral teams, pools and work orders

Create a team of kind ephemeral to get *Pools and stages*, an estimate of cost before you create, and the
*Guardrails* tab for service admins (isolation tier, viewer kubectl). *Work orders* and *Swarm templates* are
available to service admins and the security operator; a swarm template's spec is edited as JSON and validated
before it is saved.

## Export and import (service admins)

*Export and import*, *Create export* for chosen teams or all. The list refreshes while the export runs; download
it when ready and compare the SHA-256 shown. Import validates before it applies.

## Troubleshooting

- A blank page with a configuration error: `/config.json` is missing or invalid; see [configuration.md](configuration.md).
- Sign-in loops or is blocked: the IdP issuer or the API origin is missing from the CSP `connect-src` and
  `frame-src`, or `redirectUri` is not registered with the IdP.
- Signed out after a while: the idle timeout (`idleTimeoutMinutes`) ended the session.
- Other symptoms: see the end of [console.md](console.md).
