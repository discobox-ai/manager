---
name: merge-queue
description: The owner's merge queue for discobox-ai/discobox and discobox-ai/vm. Holds the owner's own merge credential, watches for PRs the GitHub user ibuildthecloud has approved, and merges them one at a time in approval order once GitHub says each is mergeable and its CI is green. A PR that needs a rebase goes back to its worker (labelled needs-rebase, which the manager acts on); the queue never pushes. Use when the manager starts a box with /merge-queue.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: none
  argument-hint: "(no arguments)"
---

# Merge queue

The owner (2026-11-16): "I want to create effectively a merge queue ... a
dedicated worker that have merge privileges and will only merge after
ibuildthecloud github user has approved the PR. It's important that the
merging it done in order and basically manage the rebasing chaos." And:
"we don't want the merge-queue to manage the rebase, just notify the worker
that ones the PR to rebase."

You merge **with the owner's own credential**, so every merge is theirs. The
owner's approval is the decision, and you carry it out carefully. You never
merge a PR the owner hasn't approved, never merge two at once, and **never
push to anything**: a rebase is always the PR's own worker's job. Read the
`worker` skill for tags and power. This job has no issue and writes no code.

The merge-gate box (`merge-gate`) is separate: it auto-merges small bot PRs
with no approval. You don't touch PRs it is gating, and it doesn't touch
PRs in your queue.

## 1. Ask for the credential, once

For `discobox-ai/discobox` and `discobox-ai/vm`, 30 days, API only:

```sh
args=""
for repo in discobox-ai/discobox discobox-ai/vm; do
  args="$args -route PUT api.github.com/repos/$repo/pulls/*/merge"
  args="$args -route POST api.github.com/repos/$repo/issues/*/comments"
  args="$args -route POST api.github.com/repos/$repo/issues/*/labels"
  args="$args -route DELETE api.github.com/repos/$repo/issues/*/labels/**"
  args="$args -route POST api.github.com/repos/$repo/labels"
  args="$args -route GET api.github.com/repos/$repo/**"
done
discobox-access request -name github-queue -env-var GH_TOKEN -ttl 720h $args \
  -justification "The owner's merge queue (2026-11-16): merge PRs in discobox and vm that ibuildthecloud has approved, in approval order, once each is mergeable and green; label and comment. Merge with rebase only. No git push, no settings, no workflows." \
  -wait -timeout 24h
```

To compare an approved commit with a later rebase (§2), fetch with no
credential: both repositories and the bot's forks are readable over plain
`git fetch https://github.com/...`.

Tag the box `needs-input` while it waits. If it's denied, tag `blocked`,
say so, and stop. When it lapses, ask again the same way. Then create these
labels once in each repository (a 422 means one already exists):
- `merge-queue`: "Approved by the owner; in the merge queue"
- `queue-merged`: "Merged by the merge queue"
- `needs-rebase`: "The merge queue needs its worker to rebase it"

## 2. Who is in the queue

Watch both repositories (the `discobox-monitor` skill's GitHub repository
monitor, `watch=prs`, plus a REST rescan every 5 minutes; its GraphQL
reads aren't in your credential, so use REST). A PR **is in the queue**
when all of these hold:

- it's open, not a draft, and its base is the repository's default branch;
- the **latest review by the GitHub user `ibuildthecloud`** is `APPROVED`
  (`GET /repos/<repo>/pulls/<P>/reviews`, all pages, the newest review by
  that login decides). A later `CHANGES_REQUESTED` or a dismissal takes it
  out;
- the approval is for the PR as it is: the approved review's `commit_id`
  is the current head, **or** the current head is its worker's rebase of
  that commit with the same patch. Check that with `git range-diff
  <old base>..<approved> <new base>..<head>`: no change beyond the rebase.
  Any other push after the approval takes it out until the owner approves
  again; say so on the PR, once.

Its place is its **approval time** (`submitted_at` of that review): first
approved, first merged. A PR waiting on a rebase or on CI keeps its place.
Label it `merge-queue` when it enters, and remove the label when it leaves.
Keep the queue in `~/queue.json` (repository, PR, approval time, approved
sha), and rebuild it from GitHub whenever you're unsure.

## 3. Merge, one at a time, in order

Go down the queue from the oldest entry. Only one merge is ever in flight.

1. **Re-check** §2. If it fails, drop the PR from the queue and comment why.
2. **Mergeable and green?** GitHub's `mergeable` is true and
   `mergeable_state` is `clean` (re-read while it's `unknown`). Every
   check run on the head completed with `success`, `skipped` or `neutral`,
   and every status is `success`. Being behind `main` is fine: GitHub's
   mergeability and green checks are the whole test, the same as the merge
   gate's Gate 2. If it's all true, merge it (step 5).
3. **Needs a rebase** (`dirty`, or GitHub says not mergeable): don't touch
   the branch. Label it `needs-rebase`, and comment once: `Merge queue:
   approved, but it conflicts with main (<sha>). Its worker needs to rebase
   it (comment first, as the worker skill says); it keeps its place in the
   queue.` Name the worker's box from the issue's "**In progress**"
   comment if there is one. The manager acts on the label and wakes the
   worker. Go on to the next entry.
4. **Checks running or red.** Running: go on to the next entry, and come
   back. Red: label it `status/blocked`, comment once with which check
   failed, and go on; the manager wakes its worker. When it's green and
   mergeable again, remove the labels and it's back in its place.
5. **Merge:** re-read the head. If it moved, go back to step 1. Then:
   ```sh
   gh api -X PUT repos/<repo>/pulls/<P>/merge -f merge_method=rebase -f sha=<head>
   ```
   Rebase only, never merge commits or squash. **Label it `queue-merged`
   and remove `merge-queue` before the merge call, not after**: a label
   change on a merged PR starts a run that cancels `main`'s own push run
   (discobox#1265). If the merge is refused, put the labels back. After it
   merges, only comment: `Merged by the merge queue at <sha> (approved by
   ibuildthecloud at <time>).`
6. Start again from the top. **Every merge moves `main`**, so re-read each
   PR's mergeability before merging it: one that was clean may now
   conflict.

An older PR waiting on a rebase or CI doesn't hold up younger ones that are
ready. "In order" means: whenever two are ready, the older approval merges
first.

## 4. Rules

- **Never** merge without the owner's current approval (§2), never merge a
  younger ready PR before an older ready one, and never merge two at once.
  Never push anything, anywhere.
- An ADR PR approved by the owner merges like any other. The approval is
  their acceptance.
- `main`'s own CI going red after one of your merges: stop the queue (merge
  nothing more), comment on the PR that went in last, and wait. The
  manager's fix-ci, or the owner, says when to resume.
- The manager reaches you by typing into this box. "Stop" means merge
  nothing until told to start again. Your PR comments and labels are your
  reports. A box can't message sessions.
- Don't sleep the box: the credential and the watch stay with it.
