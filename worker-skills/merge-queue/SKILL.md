---
name: merge-queue
description: The owner's merge queue for discobox-ai/discobox and discobox-ai/vm. Holds the owner's own merge credential, watches for PRs the GitHub user ibuildthecloud has approved, and merges them one at a time in approval order, rebasing each onto the current base and waiting for green CI first, so approved PRs land without rebase chaos. Use when the manager starts a box with /merge-queue.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: none
  argument-hint: "(no arguments)"
---

# Merge queue

The owner (2026-11-16): "I want to create effectively a merge queue ... a
dedicated worker that have merge privileges and will only merge after
ibuildthecloud github user has approved the PR. It's important that the
merging it done in order and basically manage the rebasing chaos."

You merge **with the owner's own credential**, so every merge is theirs. The
owner's approval is the decision; you are its careful executor. You never
merge a PR the owner hasn't approved, never change what it does, and never
merge two at once. Read the `worker` skill for tags and power. This job has
no issue and writes no product code. A rebase is the only change you make to
a PR's branch.

The merge-gate box (`merge-gate`) is separate: it auto-merges small bot PRs
with no approval. You don't touch PRs it is gating, and it doesn't touch
PRs in your queue. Both merge onto the same `main`, so you always rebase
against `main` as it is at that moment (§3).

## 1. Ask for the credential, once

For `discobox-ai/discobox` and `discobox-ai/vm`, 30 days:

```sh
args=""
for name in discobox vm; do
  repo=discobox-ai/$name
  args="$args -route PUT api.github.com/repos/$repo/pulls/*/merge"
  args="$args -route POST api.github.com/repos/$repo/issues/*/comments"
  args="$args -route POST api.github.com/repos/$repo/issues/*/labels"
  args="$args -route DELETE api.github.com/repos/$repo/issues/*/labels/**"
  args="$args -route POST api.github.com/repos/$repo/labels"
  args="$args -route GET api.github.com/repos/$repo/**"
  # A rebase pushes to the PR's head branch on the bot's fork
  # (maintainers may edit the PRs the bot opens):
  args="$args -route github.com/ibuildthecloud-bot/$name.git/**"
  args="$args -route github.com/$repo.git/**"
done
discobox-access request -name github-queue -env-var GH_TOKEN -ttl 720h $args \
  -justification "The owner's merge queue (2026-11-16): merge PRs in discobox and vm that ibuildthecloud has approved, in approval order, rebasing each onto main and waiting for green CI first. Merge with rebase only; push only to an approved PR's own head branch, with a lease; no settings, no workflows, no other refs." \
  -wait -timeout 24h
```

Tag the box `needs-input` while it waits. If it's denied, tag `blocked`,
say so, and stop. When it lapses, ask again the same way. Then create the
two labels once in each repository (a 422 means one already exists):
`merge-queue` ("Approved by the owner; in the merge queue") and
`queue-merged` ("Merged by the merge queue").

## 2. Who is in the queue

Watch both repositories (the `discobox-monitor` skill's GitHub repository
monitor, `watch=prs`, plus a REST rescan every 5 minutes; its GraphQL
reads aren't in your credential, so use REST). A PR **enters the queue**
when all of these hold:

- it's open, not a draft, and its base is the repository's default branch;
- the **latest review by the GitHub user `ibuildthecloud`** is `APPROVED`
  (`GET /repos/<repo>/pulls/<P>/reviews`, all pages, the newest review by
  that login decides). A later `CHANGES_REQUESTED` or a dismissal takes it
  out;
- the approval is for the PR as it is: the approved review's `commit_id`
  is the current head, **or** the current head is a rebase you made of
  that commit (§3 records it), with the same patch (`git range-diff` shows
  no change). Any other push after the approval takes it out until the
  owner approves again. Say so on the PR, once.

Its place is its **approval time** (`submitted_at` of that review): first
approved, first merged. Label it `merge-queue` when it enters, and remove
the label when it leaves. Keep the queue in `~/queue.json` (repository, PR,
approval time, approved sha, rebased sha), and rebuild it from GitHub
whenever you're unsure.

## 3. The head of the queue, one at a time

Take the oldest entry. Only one PR is ever in flight.

1. **Re-check** §2's conditions. If any fails, drop it from the queue and
   comment why.
2. **Up to date?** Compare `main...<head>` (`behind_by`). If it's 0 and
   every check on the head is green, go to step 5.
3. **Rebase.** First comment on the PR, `Merge queue: rebasing onto main
   (<sha>) before merging. Box: discobox:///<id>.` (the `worker` skill's
   rule). Fetch `main` and the PR's branch, rebase keeping both sides of
   any conflict, re-run generators rather than hand-merging generated
   files, and push to the PR's head branch with an explicit lease on its
   current head. Record the new sha as the approved commit's rebase.
   - **A conflict you can't resolve without changing what the PR does**,
     or one that touches design: don't guess. Comment what conflicts, label
     it `status/blocked` (remove `merge-queue`), and move to the next
     entry. The manager wakes its worker, and the owner approves again
     afterwards.
4. **Wait for CI** on the new head: every check run completed with
   `success`, `skipped` or `neutral`, and every status `success`. Poll each
   minute, up to 60 minutes. Red: comment which check failed, remove it from
   the queue, label it `status/blocked`, and go on. The manager wakes its
   worker. A flake you can name (an open `type/flake` issue for that exact
   test) gets one more push to re-run, then counts as red.
5. **Merge:** re-read the head. If it moved, go back to step 1. Then:
   ```sh
   gh api -X PUT repos/<repo>/pulls/<P>/merge -f merge_method=rebase -f sha=<head>
   ```
   Rebase only, never merge commits or squash. Label it `queue-merged`,
   remove `merge-queue`, and comment `Merged by the merge queue at <sha>
   (approved by ibuildthecloud at <time>).`
6. Go back to step 1 for the next entry. **Every merge moves `main`**, so
   the next one is rebased against the new `main` before it merges.

## 4. Rules

- **Never** merge without the owner's current approval (§2), out of order,
  or two at once. Never push anywhere but an approved PR's own head branch,
  never `--force` without a lease, never to `main`, and never change a PR's
  content beyond the rebase.
- An ADR PR approved by the owner is merged like any other. The approval is
  their acceptance.
- `main`'s own CI going red after a merge: stop the queue (merge nothing
  more), comment on the PR that went in last, and wait. The manager's
  fix-ci, or the owner, says when to resume.
- The manager reaches you by typing into this box. "Stop" means merge
  nothing until told to start again. Your PR comments are your reports. A
  box can't message sessions.
- Don't sleep the box: the credential and the watch stay with it.
