---
name: github
description: How the manager reads and changes GitHub — issues, labels, PR state and checks, closing delivered issues, and pushing to this repository. Use for any gh call, label change, issue filing or close.
---

# GitHub

`eval "$(discobox-access env)"` gives `GH_TOKEN` (the `github` binding). Commands
that could read stdin get `</dev/null` in loops.

## Reading

- PR state and checks:
  `gh pr view N -R <repo> --json state,isDraft,mergeStateStatus,statusCheckRollup`.
- An issue body is `gh issue view N -R <repo> --json title,body,labels`. When `gh`
  hangs, the pool proxy may be down for a moment, so retry with `timeout`.
- Main's CI: `gh api repos/<repo>/actions/runs?branch=<default>&status=completed`.
  Skip cancelled runs.

## Filing and editing issues

- Write issues as `## Today` (facts, with file paths) / `## Wanted` (what to
  decide or build; open questions marked open) / `## Done when`. A worker
  must be able to start from the issue alone.
- `gh issue create --body-file F`, and `gh issue edit N --body-file F`.
- Labels follow `docs/labels.md`. Changing an issue's `status/*` means
  removing the old one in the same call:
  `--remove-label status/ready --add-label status/in-progress`.

## Closing

Close through REST, not `gh issue close` or `gh pr close`: those run GraphQL
mutations your role doesn't allow. Comment first, then close:

```sh
gh api -X POST repos/<repo>/issues/<N>/comments -f body='Delivered in #<PR>.'
gh api -X PATCH repos/<repo>/issues/<N> -f state=closed -f state_reason=completed
```

- **A PR merged without closing its issue:** close the issue as above.
- **A superseded or obsolete issue:** `state_reason=not_planned`, with a
  comment naming what replaced it.
- **A community PR with no issue** (`docs/gates.md`): a PR is an issue to
  this API, so the same two calls close it, with `state_reason` left out:

  > Thanks for the contribution. Every pull request here must be linked to an
  > issue: please open one (or find the existing one) describing the problem
  > or the change, then open the PR again with `Closes #<issue>` in its
  > description.

  A community PR is one whose `author_association` is not `OWNER`, `MEMBER`
  or `COLLABORATOR` (`gh api repos/<repo>/pulls/<P> --jq
  .author_association`). It names an issue when its body or a commit says
  `Closes`, `Fixes` or `Resolves #N`, or `Part of #N`, and that issue exists
  in the repository.

## Pushing to discobox-ai/manager (this repository)

Every change to this repository is committed and pushed to `main` as soon as
it's made; the owner gave that go-ahead standing (2026-11-01). Workers install
their skills from the pushed `main`, so nothing here may stay local. One
commit per change, rebased on the remote first:

```sh
H='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'
git -c credential.helper= -c credential.helper="$H" fetch https://github.com/discobox-ai/manager.git main
git rebase FETCH_HEAD
git -c credential.helper= -c credential.helper="$H" push https://github.com/discobox-ai/manager.git HEAD:main
```

Then check nothing is left: `git status --porcelain` is empty and `HEAD`
equals the remote `main` (`git ls-remote https://github.com/discobox-ai/manager.git main`).

Changes to the product repositories never go this way: only a worker's PR
does.
