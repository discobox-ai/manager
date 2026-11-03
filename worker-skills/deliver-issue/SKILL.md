---
name: deliver-issue
description: Take one issue from implementation to a merged pull request — implement it, review it with discobox-review, verify it at runtime, commit, open a PR from discobox/issue-<N>, drive CI green, then keep the PR mergeable and answer review until a human merges it. Use when a worker box is launched to deliver an issue.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Agent, SendMessage, Skill, Monitor, AskUserQuestion
metadata:
  discobox.role: github-deliver
  argument-hint: "<issue-number>"
---

# Deliver an issue

One issue, one branch, one PR, carried until it merges. This skill sequences
the repository's own way of building and the other worker skills; it
doesn't replace them.

**Read the `worker` skill first.** It gives you `REPO`, `N` and `BASE`, your
tags, how to ask the owner, and your GitHub access (role `github-deliver`).

Invoking this skill is authorization to: push the branch
`discobox/issue-N` to `REPO` (create it, fast-forward it, and force-push it
with a lease after a rebase onto `BASE`), open and edit one PR from it into
`BASE`, comment on that PR and reply to its review, and re-run its failed CI
jobs. It is not authorization to push `BASE` or any other branch, merge,
enable auto-merge, close anything, or force-push without a lease. Where
`open-pr` says a rebase and force-push need asking first, this skill has
asked.

## 0. Before anything

- **Read the issue** (`gh api repos/$REPO/issues/$N` and its comments),
  every issue it names as a blocker or context, and the ADRs it cites. The
  triage comment, if there is one, holds the reproduction and a failing test.
  An ADR the issue depends on must be **Accepted**: one still Proposed means
  tag `blocked`, comment that it waits on the ADR, and stop.
- **Read how the repository is built** (`worker`, The repository says how
  it's built), down to each package you'll touch.
- Hold the box up and check the disk (`worker`, Keeping the box up).

## 1. Implement

When the triage comment has a failing test, start by adding it, unchanged,
where its neighbours live, and confirm it fails. The fix is proven by that
test going green.

Build the change the way the repository says: structural, tests with it,
its design docs updated in the same change. A choice that isn't yours (scope,
a product default, two defensible designs) is a question for the owner
(`worker`, Asking the owner). A design with a plausible rejected alternative
that no accepted ADR covers is out of scope for delivery: tag `blocked` and
say it needs an ADR first.

Run the tests of what you touched and the repository's own checks (lint,
generated files, hooks) as it says.

Status line: `implemented: <what>, tests <pass/fail>, checks <state>`.

## 2. Review

Invoke `discobox-review` and drive it to full sign-off. Its rules hold: you
fix or push back with a reason, the reviewer resolves.

Status line: `reviewed: <rounds> rounds, <what it found>`.

## 3. Verify

Invoke the `verify` skill (it reads the repository's `verify-recipes`).
Verification is observing the changed behaviour in the running product, not
tests. Clean up anything you created to do it.

When verify finds a bug: fix it, review the fix, verify again. A path that
can't run here (another OS, a real cloud) is named as unverified, never
skipped silently.

Status line: `verified: <what was observed>` or `verify found: <bug>, fixing`.

## 4. Commit

Group and word the commits as the `commit` skill describes, but don't stop to
confirm the grouping: the review approved the content. Ask only when a change
plainly belongs to something other than this issue. Fixes after a commit are
new commits on top; never amend or squash a pushed commit. `git status
--short` is empty before §5.

## 5. Open the PR

Invoke `open-pr` with branch `discobox/issue-N`, adding to its rules:

- After a rebase, read the branch's head on GitHub first (`git ls-remote
  "$GH_URL" refs/heads/discobox/issue-N`) and lease against it:
  `git push --force-with-lease=refs/heads/discobox/issue-N:<sha> "$GH_URL"
  HEAD:refs/heads/discobox/issue-N`. A bare `--force-with-lease` to a URL
  has no tracking ref and is always rejected.
- The body's Testing section carries the review summary and what `verify`
  observed, and what couldn't run here.

Status line: `PR #P open, CI <state>`.

## 6. Keep it mergeable until merged

Arm a Monitor that checks every 5 minutes, refreshing the keepalive on each
poll (or the box powers off after 30 still minutes and the Monitor dies with
it), and react until the PR is merged or closed:

```bash
gh api repos/$REPO/pulls/$P --jq '"\(.state) \(.merged_at != null) \(.mergeable_state) \(.head.sha)"'
gh api repos/$REPO/pulls/$P/reviews --jq '.[] | "\(.id) \(.user.login) \(.state)"'
gh api repos/$REPO/pulls/$P/comments --jq '.[] | "\(.id) \(.in_reply_to_id) \(.user.login)"'
gh api repos/$REPO/issues/$P/comments --jq '.[] | "\(.id) \(.user.login)"'
gh pr checks $P --repo $REPO --json name,bucket
```

- **`mergeable_state` `dirty`**: `BASE` moved. Fetch it, rebase onto it
  keeping both sides of every conflict, run the tests the conflict touched,
  and push with the lease from §5. `unknown` just after a merge is GitHub
  recomputing: check again first.
- **A new review, review comment or PR comment** from anyone: read a
  review's body as well as its threads, and answer every finding on its own
  thread (`gh api -X POST repos/$REPO/pulls/$P/comments/<id>/replies -f
  body=…`). Findings in a review body with no thread go in one PR comment.
  - right: fix it, and reply with what changed and the commit;
  - wrong or out of scope: reply with why, briefly;
  - raised again after an answer: reply with a link to the answer;
  - a judgement for the owner: ask (`worker`, Asking the owner), then reply.

  A fix is new code: review it, verify it if it changes behaviour, commit on
  top, push, get CI green again.
- **A failing check on the head commit**: fix it as `open-pr` §4 says.
- **Merged**: tag `merged`. **Closed without merging**: drop the state tag.
  Either way stop the Monitor, remove the keepalive, and finish.

**Your state tag through all of this** (`worker`, Tags):

- `ready`: every check on the head commit is green, every review, thread and
  comment has a reply, `mergeable_state` is neither `dirty` nor `unknown`,
  and the PR is marked ready. It needs only a human merge. GitHub's own
  `mergeable_state` `blocked` (a required review not given) still counts as
  ready: it's waiting for its human.
- none: you're working. When a `ready` PR goes `dirty`, gets a new review or
  comment, or a check leaves `pass`, drop `ready` before you start on it.
- `blocked` / `needs-input`: as `worker` says.

Status line on every change: `PR #P: <what happened, what you did>`.

## Done when

The PR is merged or closed. Finish with the PR URL, its final head SHA, the
review rounds, everything `verify` observed or couldn't run, and any CI
failure left as pre-existing.
