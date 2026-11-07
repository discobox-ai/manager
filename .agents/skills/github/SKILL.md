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

## The footer

Everything you post (issues, comments, process checks, closing notes, PR body
edits) ends with a footer naming this box, on its own line, last:
`<sub>From \`$DISCOBOX_ADDRESS\`</sub>` (owner, 2026-11-03). Workers do the same
(`worker` skill, Comments).

## References

A bare `#N` links to the repository the text is posted in. In any comment,
issue or PR body outside discobox-ai/discobox, write a discobox issue or PR
as `discobox-ai/discobox#N` (and any other repository's the same way, e.g.
`discobox-ai/vm#46`). Only an issue in the same repository may be a bare `#N`.
Check before posting: every `#N` in a release-validation, site, vm, hooks,
tour or manager text that means a discobox issue is wrong (owner,
2026-11-05).

## Filing and editing issues

- Write issues as `## Today` (facts, with file paths) / `## Wanted` (what to
  decide or build; open questions marked open) / `## Done when`. A worker
  must be able to start from the issue alone.
- `gh issue create --body-file F`, and `gh issue edit N --body-file F`.
- **An issue a worker filed** (`worker` skill; owner, 2026-11-04): a worker
  files what it finds in its own repository directly, and comments `Filed #M`
  on its issue. It arrives as a new issue: triage it (`triage-intake`). One
  titled `Flaky: ` is a flake: label it `type/flake`, `priority/high`,
  `status/ready`, no triage, as for a flake you saw in CI (`docs/gates.md`).
- **A worker's "Issue to file" comment** (`worker` skill): for another
  repository than its own, a worker posts the issue as a comment headed
  `**Issue to file** in <repo>` on its own issue or PR. File it as written
  (check `search/issues` for a duplicate first; link the duplicate instead
  if there is one), with the footer, then reply on the worker's thread: `Filed
  as <repo>#N.` Triage it like any new issue (`triage-intake`). If the worker
  is stopped waiting on the number, type the link into its box. A worker
  asking for a credential to file an issue gets pointed here instead.
- **A PR carries its issue's milestone** (owner, 2026-11-07, PR 782). When
  a worker's PR appears, set the PR's milestone to its issue's (`Closes` or
  `Part of #N`) with
  `gh api -X PATCH repos/<repo>/issues/<PR> -F milestone=<number>`, and
  again whenever the issue's milestone changes. An issue with no milestone
  leaves its PR with none.
- Labels follow `docs/labels.md`. Changing an issue's `status/*` means
  removing the old one in the same call:
  `--remove-label status/ready --add-label status/in-progress`.

## The process comment

Before a green PR goes to the owner as "Review and merge", check its body's
**Evidence** section (`open-pr`) and comment once on the PR saying what you
found. It isn't a gate: the owner can merge with or without it. It tells
them, in one place, what the worker says it did and what's missing.

Check:

- **Head:** the Evidence's review SHA is the PR's head commit, or only
  commits after it that the Evidence explains.
- **Review:** discobox-review was driven to sign-off.
- **Verify:** a verdict, and PASS or a SKIP with a reason; anything not run
  is named.
- **Tests and CI:** every check on the head commit is green.
- **Done when:** every item in the issue's Done when is answered.
- **ADR:** if the issue needed one, its PR merged and this PR marks it Accepted.

Anything missing or not matching goes back to the worker first (type it into
its box: "The PR's Evidence is missing <x>; do it and update the body"). Once
it's complete, comment:

```markdown
**Process check** at `<head sha>`

- [x] discobox-review: <rounds>, signed off (worker's report)
- [x] verify: <verdict> — <one line> (worker's report)
- [x] CI: all <n> checks green
- [x] Done when: <n>/<n> covered
- [x] ADR <id>: Accepted | not needed

Not verified here: <what the worker couldn't run, or "nothing">.
These are the worker's reports; CI is the only independent check.
```

A box left unchecked says why. After a new push, check again and post a new
comment for the new head.

## Closing

Close through REST, not `gh issue close` or `gh pr close`: those run GraphQL
mutations your role doesn't allow. Comment first, then close:

```sh
gh api -X POST repos/<repo>/issues/<N>/comments -f body='Delivered in #<PR>.'
gh api -X PATCH repos/<repo>/issues/<N> -f state=closed -f state_reason=completed
```

- **A PR merged without closing its issue:** close the issue as above.
- **Never reopen an issue the owner closed**, or one closed at their word
  (discobox#521 was reopened twice by release validation after the owner had
  ruled its behavior correct, 2026-11-06). New evidence goes on it as a
  comment, and the table gets the question ("discobox#521 reproduces in
  rc.6: still fine?"). Only the owner reopens it. The check that found it
  is a mistake in the validation notes, not a release blocker: have it fixed
  there (`validate-release`, §0).
- **A superseded or obsolete issue:** `state_reason=not_planned`, with a
  comment naming what replaced it.
- **A teammate's PR we've taken over** (`workers`, Taking over a PR): once
  the bot's PR is open, comment `Superseded by #<new>`, then close it with
  the same call, `state_reason` left out. `Closes #<old>` in the new PR
  wouldn't do it: closing keywords close issues, not PRs.
- **A community PR with no issue** (`docs/gates.md`): a PR is an issue to
  this API, so the same two calls close it, with `state_reason` left out:

  > Thanks for the contribution. Every pull request here must be linked to an
  > issue: please open one (or find the existing one) describing the problem
  > or the change, then open the PR again with `Closes #<issue>` in its
  > description.

- **A community PR whose issue we've now opened a PR for:** comment, then
  close it the same way:

  > Thanks for this. #<our PR> implements #<issue> through our own process
  > and replaces this pull request: we don't merge pull requests from outside
  > the team, so I'm closing this one.

- **A community PR whose issue we've rejected** (closed as not planned):
  comment with the reason, then close it:

  > Thanks for this. We've decided not to do #<issue> (<one line why>), so
  > I'm closing this pull request too.

  Never merge a community PR, check it out, run it, or approve its CI
  (owner, 2026-11-04).

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
