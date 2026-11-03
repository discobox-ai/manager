---
name: start-loop
description: Start (or restart) the manager's loop from nothing — check its access, turn on watching, find which repositories are migrated, rebuild the status table from GitHub and its workers' tags, post it, take the first actions, and start waiting for events. Use when the manager's box starts (its launch prompt is /start-loop), after a restart, or whenever the owner says /start-loop.
---

# Start the loop

Everything you need is in GitHub and on your boxes' tags (`docs/state.md`).
Nothing from an earlier session is assumed. Safe to run again at any time:
every step checks before it acts.

```sh
export DISCOBOX_SERVER=https://api.discobox.internal
eval "$(discobox-access env)"; unset DISCOBOX_TOKEN
```

## 1. Access

`discobox-access list` must show both:

- a credential in `GH_TOKEN` reaching `api.github.com`, your own use;
- exactly one credential you may delegate reaching `api.github.com`, what you
  bind workers from.

Go by the variable and the hosts, not the name: the owner chooses which
secret to grant, and it may not be called `github` (`workers`, Launch, reads
the delegated one's name).

If either is missing, or `roles/manager-request.json` changed since it was
approved (a repository or role was added), send it from this repository's
root and wait for the owner (`roles/README.md`):

```sh
discobox-access request --json < roles/manager-request.json
```

Run it in the background and keep its request ID. Say in one line that
you're waiting for the owner to approve it, and go no further until both
parts are approved. A denied part: say what it stops you doing, and stop.

Then check `discobox ls -o json` works (the discobox API). Refused means the
box was started without `--discobox-api`: tell the owner, and stop.

## 2. This repository

`git status` clean, and `HEAD` equal to `main` on GitHub (`github` skill,
Pushing to discobox-ai/manager). Pull if GitHub is ahead. Workers install
their skills from the pushed `main`.

## 3. Watching

`discobox-monitor status`. Enable whatever of the `watch` skill's monitors is
missing, and disable instances for repositories no longer in
`manager.yaml`. Then drain what queued while you were away:
`discobox-monitor pop`, and keep the events for §5.

## 4. Which repositories are migrated

For each repository in `manager.yaml`:

```sh
gh api "repos/<repo>/labels?per_page=100" --paginate --jq '.[].name' | grep -c '^status/'
```

A repository is migrated when it has every `status/*` and `type/*` label
(`docs/labels.md`). **In one that isn't, every open issue looks new, and
none is.** Start no triage there. Its row on the table is "label migration".

## 5. Rebuild the table

From GitHub, for each repository:

- open issues and their `status/*`, `type/*`, `priority/*` labels;
- open PRs, their checks on the head commit, their mergeable state, and the
  issue each names (`Closes #N` / `Part of #N`);

and from your boxes: `discobox ls -o json`, the ones you created, with their
tags (`repo`, `issue`, `job`, `pr`, the state tag) and, for any that looks
stopped on something, the bottom of its live screen (`workers`).

Match them up by `repo` and `issue`. Then:

- **A box of yours on an issue:** the row follows its state tag.
- **A box of yours showing a question without its tag:** tag it now
  (`workers`, A question without its tag).
- **An issue `status/in-progress` with no box of yours:** someone else's
  worker has it (another manager, or the owner). Row "worker not mine", and
  start nothing for it.
- **A community PR** (author not an owner, member or collaborator): no
  issue named means comment and close it; an issue named means no row (it's
  reference only), unless one of our PRs for that issue is open, in which
  case comment and close it (`docs/gates.md`).
- **A maintainer's PR with no issue:** row "needs an issue".
- **A PR from a box of yours that merged, with its issue still open:** close
  the issue (`github` skill) and retire the box.
- **A finished box** (its PR merged or closed, a triage or job `ready` with
  nothing left, or `to-delete`):
  a row for the owner to delete.

Post the table (`table` skill), with its link list.

## 6. First actions

Handle the events from §3, then work through the gates (`docs/gates.md`), in
this order, within `workers.max` and `disk.minFreeGiB`:

1. **Unmigrated repositories:** start one `migrate-labels` worker per
   repository (`workers`, Launch). Its plan comes to the owner in its box.
2. **What's waiting on a worker you hold:** rebase, fix CI, answer
   mechanical prompts.
3. **`status/ready` issues** with a free slot.
4. **New issues** in migrated repositories: triage, at most
   `workers.triageMax` at once, highest `priority/*` first, then newest.

Re-post the table if a row changed.

## 7. Wait

Start the waiting `discobox-monitor pop --wait=4h` in the background
(`watch` skill), and go to the loop's step 2 (`AGENTS.md`).
