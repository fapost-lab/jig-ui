<!--
One concern per pull request. Two unrelated fixes are two pull requests — they
review faster and revert cleanly.
-->

## What this changes

<!-- What the reader gets that they did not have. A sentence or two. -->

## Why

<!--
The reasoning, not a restatement of the diff. If there is an issue, link it:
"Fixes #123". If a design decision here could reasonably have gone the other
way, say why it went this way — that is the part review cannot reconstruct.
-->

## How it was verified

<!--
What you ran, and what it did. "Tests pass" is not verification; naming the test
that fails without the fix is.
-->

---

- [ ] Tests cover the change — the narrowest ones that would have caught the bug
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes — `tsc` for the server, `vue-tsc` for the page
- [ ] `npm run build` passes and `npm pack --dry-run` lists what should ship
- [ ] Documentation in `docs/` updated, if observable behaviour changed
- [ ] I have read the [CLA](https://docs.fapost.in/contributing/legal) and my contribution is offered under it
