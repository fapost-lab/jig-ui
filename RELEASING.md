# Releasing

`@fapost/jig-ui` is published to npm by `.github/workflows/release.yml` using npm trusted
publishing (OIDC). There is no npm token in the repository secrets.

## How versions flow

- **A merge to `main` that changes `version` in `package.json` to a stable one** (no `-`)
  publishes that version under `latest`, runs `install.sh` on
  Linux, macOS and Windows against it (`installer.yml`, once npm serves it as `latest`), and then creates its GitHub Release
  carrying `install.sh`, which creates the tag `v<version>` on the merge commit. The line in
  `docs/installation.mdx` downloads the script from the latest release.
- **Any other merge to `main`** publishes `<major>.<minor>.<patch + 1>-next.<run number>` under the
  `next` dist-tag — `0.5.1-next.<n>` after 0.5.0 — so it sorts after the latest release.
  `npx @fapost/jig-ui@next` runs the latest merge. The workflow sets that version only in its own
  checkout; nothing is committed back. With a prerelease version in `package.json` it publishes
  `<version>-next.<run number>`. While the version in `package.json` has no tag, the run warns that
  it is not released.
- **A `v<version>` tag pushed by hand** on a commit of `main` still releases its version; the
  workflow fails unless the tag equals `v` plus the `version` in `package.json`. A version with a
  `-` (for example `v0.2.0-rc.1`) is published under `next` and gets no GitHub Release.
- Nothing is published unless typecheck, tests and build pass on Linux, macOS and Windows first.
- A version npm already has is not published again, and a GitHub Release that exists is not made
  again: a release run that failed is re-run, and stays a release
  (adr-20261030-a-version-pull-request-releases-itself).
- **A release that did not happen** — its run failed and was not re-run, or was cancelled while it
  waited (GitHub keeps one waiting run, and a later merge cancels it) — is never made by a later
  merge, which did not change the version: re-run the merge's run, or tag its merge commit by hand
  as above.

## Cutting a stable release

1. Open a pull request that sets `version` in `package.json` (and `package-lock.json`, with
   `npm version <x.y.z> --no-git-tag-version`) to the release version.
2. In the same pull request, bring the public documentation in `docs/` up to what the release
   ships. A release is not cut while the docs describe something else:
   - in `docs/changelog.mdx`, turn **Unreleased** into `## <x.y.z> — <date>` and leave an empty
     **Unreleased** above it; every user-visible change since the last release has a line there;
   - read each page against the release: the minimum Jig and Node.js in `docs/requirements.mdx`,
     options and commands in `docs/installation.mdx`, and any note or warning that says something
     is not there yet.
3. Merge it. The Release run on the merge commit publishes the version, tags it and creates its
   GitHub Release; watch it to the end. Nothing is raised after the release.

Only a version pull request changes `version`: a merge that raises it releases it.

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
- A tag the workflow creates starts no workflow of its own (GitHub does not start workflows for
  `GITHUB_TOKEN` events), so a release from a merge is published once, by that merge's run.
