# Releasing

`@fapost/jig-ui` is published to npm by `.github/workflows/release.yml` using npm trusted
publishing (OIDC). There is no npm token in the repository secrets.

## How versions flow

- **Merge to `main`** publishes `<version in package.json>-next.<run number>` under the `next`
  dist-tag. `npx @fapost/jig-ui@next` runs the latest merge. The workflow bumps the version only
  in its own checkout; nothing is committed back.
- **Tag `v<version>`** publishes that version under `latest`. The workflow fails unless the tag
  equals `v` plus the `version` in `package.json`.
- Nothing is published unless typecheck, tests and build pass on Linux first.
- **A stable tag** also creates its GitHub Release carrying `install.sh`, once the script has
  installed and started the published version on Linux, macOS and Windows (`installer.yml`). The
  line in `docs/installation.mdx` downloads the script from the latest release.

## Cutting a stable release

1. Open a pull request that sets `version` in `package.json` (and `package-lock.json`, with
   `npm version <x.y.z> --no-git-tag-version`) to the release version.
2. In the same pull request, bring the public documentation in `docs/` up to what the tag ships.
   A release is not cut while the docs describe something else:
   - in `docs/changelog.mdx`, turn **Unreleased** into `## <x.y.z> — <date>` and leave an empty
     **Unreleased** above it; every user-visible change since the last release has a line there;
   - read each page against the release: the minimum Jig and Node.js in `docs/requirements.mdx`,
     options and commands in `docs/installation.mdx`, and any note or warning that says something
     is not there yet.
3. Merge it.
4. Tag the merge commit and push the tag:

   ```bash
   git checkout main && git pull
   git tag v<x.y.z>
   git push origin v<x.y.z>
   ```

## One-time bootstrap (maintainer)

**Do this before the change that adds the release workflow is merged to `main`.** Otherwise the
first release run fails: the package does not exist yet, so no trusted publisher can be
configured for it.

A trusted publisher can only be configured on a package that already exists, so the first
publish is done by hand.

1. Set the version to `0.1.0-next.0` locally (do not commit it):

   ```bash
   npm ci
   npm version 0.1.0-next.0 --no-git-tag-version
   npm run build
   ```

2. Log in and publish under the `next` tag:

   ```bash
   npm login
   npm publish --tag next
   ```

3. Restore `package.json` and `package-lock.json` (`git checkout package.json package-lock.json`).
4. On npmjs.com open the package, then Settings, then Trusted Publisher, choose GitHub Actions
   and enter: organization `fapost-lab`, repository `jig-ui`, workflow `release.yml`.
5. Optionally, in the same settings page, set publishing access to require two-factor
   authentication and disallow tokens, so that only the trusted publisher can publish.

## Things to know

- The first manual publish of a new package also gets the `latest` dist-tag, whatever `--tag`
  says. Until the first `v*` tag is published, plain `npx @fapost/jig-ui` therefore runs that
  prerelease.
- After a stable `vX.Y.Z`, bump `version` in `package.json` (for example to the next minor) in a
  pull request, so that `next` builds (`<version>-next.<n>`) sort after the stable release
  instead of before it.
- A tag whose version contains a `-` (for example `v0.2.0-rc.1`) is published under `next`, not
  `latest`. The tagged commit must be on `main`.
