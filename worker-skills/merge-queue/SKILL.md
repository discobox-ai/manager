---
name: merge-queue
description: The owner's approval-to-queue box for discobox-ai/discobox and discobox-ai/vm. Holds the owner's own credential, watches for PRs the GitHub user ibuildthecloud has approved, and as soon as an approval matches the PR's current commit turns on GitHub's auto-merge (rebase) for it, so GitHub's merge queue tests and merges it. Reports a conflict (needs-rebase) or a queue ejection (status/blocked) so the manager can wake the PR's worker. Where a repository has no merge queue it merges the PR itself, once green. Never pushes. Use when the manager starts a box with /merge-queue.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: none
  argument-hint: "(no arguments)"
---

# Merge queue

The owner (2026-11-16): "a dedicated worker that have merge privileges and
will only merge after ibuildthecloud github user has approved the PR."
(2026-11-21, once `main` had GitHub's own merge queue): "can I just have the
merge queue just look for approval and then put it in the merge queue if it
matches the condition?"

So you do one thing: **when the owner's approval is valid for a PR, hand the
PR to GitHub's merge queue**, with the owner's own credential. GitHub orders
it, tests it combined with the PRs ahead, and merges it (rebase). You don't
poll CI, order merges, or merge two at once. You **never push to anything**: a
rebase is always the PR's own worker's job. Read the `worker` skill for tags
and power. This job has no issue and writes no code.

The merge-gate box (`merge-gate`) is separate: it auto-merges small bot PRs
with no approval. You don't touch PRs it is gating, and it doesn't touch PRs
in your queue.

## 1. Ask for the credential, once

For `discobox-ai/discobox` and `discobox-ai/vm`, 30 days, API only:

```sh
args=""
for repo in discobox-ai/discobox discobox-ai/vm; do
  args="$args -route PUT api.github.com/repos/$repo/pulls/*/merge"   # only where a repository has no queue (§3)
  args="$args -route POST api.github.com/repos/$repo/issues/*/comments"
  args="$args -route POST api.github.com/repos/$repo/issues/*/labels"
  args="$args -route DELETE api.github.com/repos/$repo/issues/*/labels/**"
  args="$args -route POST api.github.com/repos/$repo/labels"
  args="$args -route GET api.github.com/repos/$repo/**"
done
args="$args -route \"POST api.github.com/graphql graphql=mutation:enablePullRequestAutoMerge,disablePullRequestAutoMerge\""
discobox-access request -name github-queue -env-var GH_TOKEN -ttl 720h $args \
  -justification "The owner's approval-to-queue box (2026-11-16, 2026-11-21): when ibuildthecloud has approved a PR in discobox or vm and the approval matches its current commit, turn on auto-merge (rebase) so GitHub's merge queue merges it; label and comment; merge directly only where a repository has no merge queue. No git push, no settings, no workflows." \
  -wait -timeout 24h
```

(The enqueue mutation the box was granted on 2026-11-21 isn't needed:
auto-merge enqueues for you once the checks pass.) Tag the box `needs-input`
while it waits. If it's denied, tag `blocked`, say so, and stop. When it
lapses, ask again the same way. Then create these labels once in each
repository (a 422 means one already exists):
- `merge-queue`: "Approved by the owner; handed to the merge queue"
- `queue-merged`: "Merged by the merge queue"
- `needs-rebase`: "The merge queue needs its worker to rebase it"

To compare an approved commit with a later rebase (§2), fetch with no
credential: both repositories and the bot's forks are readable over plain
`git fetch https://github.com/...`.

## 2. When an approval counts

Watch both repositories (the `discobox-monitor` skill's GitHub repository
monitor, `watch=prs`, plus a REST rescan every 5 minutes; its GraphQL reads
aren't in your credential, so use REST). A PR **qualifies** when all of
these hold:

- it's open, not a draft, and its base is the repository's default branch;
- the **latest review by the GitHub user `ibuildthecloud`** is `APPROVED`
  (`GET /repos/<repo>/pulls/<P>/reviews`, all pages, the newest review by
  that login decides). A later `CHANGES_REQUESTED` or a dismissal ends it;
- the approval still holds for the PR: the approved review's `commit_id` is
  the current head, **or the current head is a rebase of the approved
  commits** (owner, 2026-11-21: "once I approve the assumption is that a
  rebase would maintain the approved functionality"). A rebase is `git
  range-diff <old base>..<approved> <new base>..<head>` pairing every
  approved commit with one in the new series, none added and none dropped.
  Small differences inside a paired commit don't void it: conflict
  resolution, a regenerated ADR index, a re-stamped "Today, at `<sha>`"
  line. **New content does:** an added or dropped commit, or a paired
  commit whose change is substantively different (more than resolving the
  rebase), needs the owner's approval again; say so on the PR, once, naming
  what changed.

A qualifying PR isn't touched again once it's handed over (§3); GitHub
carries it.

## 3. Hand it over

Per repository, check whether `main` has a merge queue:

```sh
gh api repos/<repo>/rules/branches/main --jq '[.[]|select(.type=="merge_queue")]|length'   # 1 = a queue
```

**A queue (discobox):** for each qualifying PR, oldest approval first,
**label it `queue-merged` and `merge-queue` first** (a label added to a PR
already merged starts a run that cancels `main`'s own push run,
discobox#1265), then turn on auto-merge with rebase:

```sh
gh api graphql -f query='mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:REBASE}){pullRequest{autoMergeRequest{enabledAt}}}}' -f id=<node_id>   # node_id: gh api repos/<repo>/pulls/<P> --jq .node_id
```

GitHub waits for the required checks, then puts the PR in its merge queue.
Don't wait for CI, merge anything yourself, or order PRs: that's GitHub's.
A 4xx is a refusal: remove the labels you added, comment what GitHub said
(for instance auto-merge isn't allowed on the repository), and tell the
manager on your screen. Comment once when you hand a PR over: `Handed to the
merge queue (approved by ibuildthecloud at <time>).` Comment "Merged by the
merge queue" only when GitHub reports it merged (`merged_at` set).

**No queue (vm, until it has one):** the PR waits for CI itself. Merge it only
when GitHub's `mergeable_state` is `clean` and every check on its head
completed `success`, `skipped` or `neutral`:

```sh
gh api -X PUT repos/<repo>/pulls/<P>/merge -f merge_method=rebase -f sha=<head>
```

Label `queue-merged` first, as above; one at a time, oldest approval first;
rebase only, never merge commits or squash.

## 4. What you report (so the manager can act)

- **A conflict** (`mergeable_state` `dirty`, or GitHub refuses with a
  conflict): don't touch the branch. Label `needs-rebase`, and comment once:
  `Merge queue: approved, but it conflicts with main (<sha>). Its worker
  needs to rebase it.` Name the worker's box from the issue's "**In
  progress**" comment if there is one. Hand it over after the rebase (the
  approval survives a rebase with the same patch).
- **Ejected from the queue** (GitHub removed it because a combined check
  failed or timed out: the PR is open, auto-merge is gone, and a failed run
  on `gh-readonly-queue/main/pr-<P>-…` shows which): remove `queue-merged`,
  comment which check failed, label `status/blocked`. The manager wakes its
  worker; hand it over again after the fix.
- **A PR whose approval stopped matching** (a push after approval, a
  dismissal): turn auto-merge off (`disablePullRequestAutoMerge`), remove the labels, say why once.

## 5. Rules

- **Never** hand over or merge without the owner's current approval (§2).
  Never push anything, anywhere.
- An ADR PR approved by the owner goes the same way. The approval is their
  acceptance.
- The manager reaches you by typing into this box. "Stop" means hand nothing
  over until told to start again. Your PR comments and labels are your
  reports. A box can't message sessions.
- Don't sleep the box: the credential and the watch stay with it.
