---
name: pr-check
description: The process check for one repository's bot PRs. Long-lived; watches the repository's open PRs by ibuildthecloud-bot and, once one is ready (out of draft, every check green, no merge conflict), reads its Evidence against the PR and its issue, then posts the "Process check" comment for its head, or tells its worker on the PR what's missing. Never merges, pushes or labels. Use when the manager starts a box with /pr-check.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: github-triage
  argument-hint: "(no arguments; the repository is the box's repo tag)"
---

# Process check

The owner (2026-11-18): "why does the manager do the review, that will just
end up blocking the loop, should we spin up a box for it? And only do that
when its ready, no merge conflicts."

This box does, for one repository, what the manager used to do itself
before a PR reached the owner: read the PR's **Evidence** against the PR and
its issue, and post one comment saying what it found. Your comment is what
puts a PR in front of the owner ("Review and merge"), and what the merge-gate
box requires before it will even consider a PR. Read the `worker` skill for
tags and power. This job has no issue and writes no code.

The repository is the box's `repo` tag (`REPO` below). Your credential is
bound at launch (`github-triage`, as the bot): read, and comment. You can't
label, merge or push, and don't try: the manager sets `status/in-review`
once your comment is up.

## 1. Watch

Watch `REPO` with the `discobox-monitor` skill's GitHub repository monitor
(`watch=prs`, `author=ibuildthecloud-bot`, `interval=5m`, which reports
checks, pushes and conflicts), and on top of it rescan every 30 minutes in
case an event was missed.

**Spend the bot's REST allowance sparingly.** Every worker shares the bot's
5000 REST calls an hour, and on 2026-11-18 they ran out. So:

- Rescan with **one GraphQL query** for the whole repository, never a REST
  call per PR: open PRs with `number isDraft headRefOid mergeable`,
  `commits(last:1){nodes{commit{statusCheckRollup{state}}}}` and
  `comments(last:30){nodes{body}}`. That tells you which are ready (§2):
  rollup `SUCCESS`, `mergeable` `MERGEABLE`, not a draft, no comment of
  yours for the head.
- Make REST calls only for a PR that's ready and unchecked (§3's reads).
- A 403 or 429 that says rate limit: stop until the reset time it gives
  (`x-ratelimit-reset`), then carry on. Don't retry in a loop.

## 2. Which PRs, and when

A PR is **ready to check** when, at its current head `<sha>`:

- `user.login` is `ibuildthecloud-bot`, and it isn't a draft;
- it isn't an ADR PR (`type/adr` on its issue, or it only adds or edits
  `docs/adr/**`). The owner reads those themselves, and the manager labels
  them `status/in-review` without a Process check; merging one accepts it;
- every check run on `<sha>` has completed with `success`, `skipped` or
  `neutral`, there is at least one, and every commit status is `success`.
  Running checks: wait, don't check yet;
- **no merge conflict:** `GET /repos/$REPO/pulls/<P>` has `mergeable` true
  and `mergeable_state` not `dirty` (re-read while `mergeable` is null).
  Behind `main` is fine. A conflict: don't check it; its worker is woken to
  rebase it (the manager does that), and the new head comes back to you;
- you haven't already commented on `<sha>`: no comment by
  `ibuildthecloud-bot` starting `**Process check** at` or
  `**Process check: missing**` naming `<sha>`'s first 7 characters.

Check ready PRs one at a time, oldest first. A new push makes a new head,
and the PR is checked again from the start.

## 3. Check it

Read the PR body's **Evidence** (the `open-pr` skill's template), the issue
it names (`Closes #N` or `Part of #N`, in this repository or another named
as `owner/repo#N`), and the PR's commits and files.

- **Head:** the Evidence's review SHA is `<sha>`, or the commits after it
  are ones the Evidence explains (a rebase, a CI fix).
- **Review:** discobox-review was driven to sign-off.
- **Verify:** a verdict, and PASS or a SKIP with a reason; anything not run
  is named.
- **E2E screenshot:** the Evidence embeds at least one screenshot (an
  image from the fork's `assets` branch) of the change run end to end
  through the CLI, the TUI or a GUI, and it plausibly shows the changed
  behaviour. Or it says "no e2e surface" with a reason that holds for this
  diff (CI, docs, ADR, no behaviour change). A change a person can run
  with no screenshot, or a reason that doesn't hold, is **missing** (owner,
  2026-11-20). A text dump alone isn't a screenshot.
- **Tests and CI:** every check on `<sha>` is green (you checked in §2).
- **Done when:** every item in the issue's Done when is answered, and the
  diff plausibly does what the Evidence says. You aren't the code
  reviewer, but an item "met" by a file the PR doesn't touch isn't met.
- **ADR:** if the issue needed one, its PR merged, and this PR marks it
  Accepted as its first commit.

## 4. Comment

**Everything holds:** post exactly this (the merge-gate box parses it;
change nothing but the fields):

```markdown
**Process check** at `<head sha>`

- [x] discobox-review: <rounds>, signed off (worker's report)
- [x] verify: <verdict> — <one line> (worker's report)
- [x] e2e: screenshot of <CLI | TUI | GUI: what it shows> | no e2e surface: <why>
- [x] CI: all <n> checks green
- [x] Done when: <n>/<n> covered
- [x] ADR <id>: Accepted | not needed

Not verified here: <what the worker couldn't run, or "nothing">.
These are the worker's reports; CI is the only independent check.
```

**Something is missing or doesn't match:** don't post a Process check.
Post one comment for the worker instead; the manager wakes it on that
comment:

```markdown
**Process check: missing** at `<head sha>`

- <what's missing or doesn't match, one line each, and what to do>

Fix it and update the PR body (or push); I'll check again at the new head.
```

A PR body edited without a new push keeps its head: when a PR you sent back
has a newer body than your comment, check it again at the same sha, and
post a fresh comment.

Then write one line on the box's screen (`<REPO>#<P> at <sha7>: checked` or
`: missing <what>`), and go back to watching.

## 5. Rules

- Never post a Process check for a sha that isn't the PR's current head, or
  for a PR with a conflict or a check that isn't green.
- Never edit or delete a comment, and never comment on a PR more than once
  per head (and per body edit, §4).
- The manager reaches you by typing into this box. "Stop" means check
  nothing until told to start again.
- Don't sleep the box: the watch stays with it.
