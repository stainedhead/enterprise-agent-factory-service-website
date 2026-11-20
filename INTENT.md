# Intent

## Purpose
Give TypeScript consumers and people in a browser first-class access to the Enterprise Agent Factory
Service: an accelerator SDK that makes the REST API easy and safe to use, and a web management console,
built on that SDK, that feels familiar to teams who use the AWS Management Console.

## Where it fits
One of four children of [enterprise-agent-factory-service](https://github.com/stainedhead/enterprise-agent-factory-service),
whose PRD defines the console screens for each role. Both packages are clients of the REST API in
`enterprise-agent-factory-service-restapi` and follow its OpenAPI contract. The `afs` CLI in
`enterprise-agent-factory-service-cli` offers the same operations on the command line.

| Package | What it is for |
|---|---|
| `@afs/sdk` (`packages/sdk`) | Typed client for every API operation: auth, pagination, concurrency headers, error mapping. Used by the console, pipelines, internal portals and automation |
| `@afs/console` (`apps/console`) | The web console for service admins, team-admins and team viewers |

## Goals
- An SDK generated from the API contract, with ergonomic resource clients and zero runtime dependencies.
- A professional, role-aware console that platform and delivery teams can use without training.
- Clean architecture in the console so features are testable and the UI can evolve independently of the API.
- Respect the role model: the console reflects permissions, and the API remains the enforcement point.

## Non-goals
- Enforcing access control in the browser.
- Holding secret values beyond a single form submit.
- Talking to Kubernetes, AWS or the database directly.
