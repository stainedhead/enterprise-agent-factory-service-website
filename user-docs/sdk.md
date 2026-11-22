# Installing the SDK from GitHub Packages

`@afs/sdk` is published to GitHub Packages as **`@stainedhead/afs-sdk`**. GitHub Packages requires the npm scope
to match the owner of the repository, so the published name differs from the workspace name `@afs/sdk`.

## Authenticate

Create a personal access token with the `read:packages` scope (and SSO authorization for the organization if
it uses SSO). Put it in your own user-level `~/.npmrc`, never in a repository:

```ini
@stainedhead:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Export `GITHUB_TOKEN` in your shell, or use `NODE_AUTH_TOKEN` in CI. A project that only needs the scope mapping
can commit this single line as its `.npmrc` (no token in it):

```ini
@stainedhead:registry=https://npm.pkg.github.com
```

## Install

```bash
bun add @stainedhead/afs-sdk
# or: npm install @stainedhead/afs-sdk
```

```ts
import { createAfs } from "@stainedhead/afs-sdk";
```

## Keep the `@afs/sdk` import name

Use an npm alias so existing imports keep working:

```json
{
  "dependencies": {
    "@afs/sdk": "npm:@stainedhead/afs-sdk@^0"
  }
}
```

`import { createAfs } from "@afs/sdk"` then resolves to the published package. The alias needs the same
`.npmrc` registry line and a token that can read the package.

## Versions

Releases are cut by pushing a tag `sdk-v<version>` (for example `sdk-v0.3.0`); the version is taken from the tag.
Pull requests that touch the SDK run a publish dry run and publish nothing.
