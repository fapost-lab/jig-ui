---
id: adr-20261030-a-version-pull-request-releases-itself
type: adr
status: accepted
date: 2026-10-30
domains: []
paths:
  - .github/workflows/release.yml
  - RELEASING.md
summary: A merge to main that brings a new stable version releases it from CI, tag included; next counts from the following patch
---
# A merge that changes the version to a stable one releases it; nobody tags by hand

## Context

A release was a version pull request, merged, and then a `v<version>` tag pushed by hand on the
merge commit (`RELEASING.md`, step 4). The tag added nothing the pull request had not decided: the
workflow already refused a tag that did not match `package.json`. It was one more step a person
could forget or put on the wrong commit. After a release, `version` also had to be raised by hand,
or the `next` builds (`<version>-next.<run>`) sorted before the release they followed.

## Decision

- On a push to `main` that changes `version` in `package.json` (against the commit `main` was on
  before the push) to a stable one (no `-`), `release.yml` releases it: publishes it under
  `latest`, runs the installer check, and creates the GitHub Release with `--target` that merge
  commit, which creates the tag.
- Every other merge publishes `<major>.<minor>.<patch + 1>-next.<run>` under `next` (a prerelease
  version in `package.json` keeps `<version>-next.<run>`), so `next` sorts after the latest release
  and the version is never raised after a release.
- A `v*` tag pushed by hand still releases its version, with the same checks as before.
- Publishing is skipped when npm already has the version (asked of the registry over HTTP, not with
  npm, which would send setup-node's placeholder token), and the GitHub Release step when the
  release exists: a failed release run is re-run and stays a release, and a run for a hand tag
  pushed while the merge's run releases the same version does nothing twice. `main` and tags share
  one concurrency group, so two runs never publish at once.
- A merge that did not change the version never releases, even when the version has no tag: a
  release whose run failed or was cancelled waiting (GitHub keeps one waiting run per group) is not
  made by an unrelated later commit, which would carry the tag. That merge publishes `next` as usual
  and warns; the release is made by re-running its run or by a hand tag.

## Alternatives

- **Tag in CI, release in the existing tag-triggered run.** A tag pushed with the workflow's
  `GITHUB_TOKEN` starts no workflow; pushing it with a personal token or an app's would put a
  credential that can write the repository into the release flow. Rejected: the run that sees the
  version releases it.
- **Keep raising the version after each release.** With releases made by a merge, raising
  `version` to the next minor would release that minor at once. Rejected for counting `next` from
  the following patch.
- **Keep the hand tag.** Rejected: one more step with no decision in it.
- **Release whenever the stable version has no tag.** The first form of this change. A failed or
  cancelled release would be made by the next merge, its tag on that unrelated commit, and every
  merge until then would publish no `next`. Rejected in review.

## Consequences

- The version pull request is the release: merging it publishes. A version raised by mistake in an
  ordinary pull request is released on merge — review of a change to `version` is review of a
  release.
- `next` builds of a minor in progress are numbered as a patch (`0.5.1-next.<n>` while 0.6.0 is
  being built); they still sort after 0.5.0 and before 0.6.0.
- `RELEASING.md` has no tag step and no bump after a release.
