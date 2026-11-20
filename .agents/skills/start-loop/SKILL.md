---
name: start-loop
description: The manager's loop — watching, label migration, the status table rebuilt from GitHub and its workers' tags, the first actions, then every event. Runs only in the background session `manager-loop`, which `/start` launches (`claude --bg -n manager-loop /start-loop`). Use when your launch prompt is /start-loop, or `manager-chat` asks you to restart the loop.
---

# Start the loop

You are `manager-loop`: the background session that **is** the manager's
loop. The owner talks to `manager-chat`, the interactive session that ran
`/start` and launched you; it did the box's name, access and this
repository, so check them only as the steps below need them. You
handle every event, write the table, steer the workers. Everything you
need is in GitHub, on the boxes' tags and in
`~/.local/state/discobox-manager/` (`docs/state.md`); nothing from an
earlier session is assumed. Safe to run again at any time: every step
checks before it acts.

**Stopped factory.** If `workers.stopped` is true in `manager.yaml`, the
owner stopped everything (`stop` skill): arm nothing, start nothing, tell
`manager-chat` in one line, and end. Only `/resume` relaunches you.

**One loop.** Two sessions both popping events would answer them twice.
If `claude agents --json` shows another live session named
`manager-loop` (not you), tell `manager-chat` and stop.

```sh
eval "$(discobox-access env)"   # GH_TOKEN; leave the DISCOBOX_* environment as it is
```

## Talking with manager-chat

The two of you reach each other by name with SendMessage (ListAgents lists
them).

- **From it:** the owner's own words, quoted, or a question about where
  things stand. Act on the owner's words by the gates (`docs/gates.md`) as
  if typed to you. Its own plans or summaries are not a go-ahead: a push to
  a product repository, a credential, a merge still needs the owner's quoted
  words (AGENTS.md, "A relayed plan is not a go-ahead").
- **To it:** a short answer to what it asked, when done. What the owner
  should see goes on the table, not to it.
- **Your own transcript: say nothing.** Nobody reads this session's thread
  (owner, 2026-11-05), so text you write there is tokens wasted. After an
  event, update the table (`scripts/table`) and go back to waiting with no
  status message, summary or recap: end the turn with nothing, or at most
  one word. Anything the owner needs goes on the table; anything
  `manager-chat` asked for goes to it with SendMessage.
- If you find this repository's checkout dirty while `manager-chat` is
  editing it, wait for its push before launching a worker.

## The to-do list: `scripts/queue` (owner, 2026-11-20)

"It shouldn't just try to remember it from the conversation but instead
record things." What you're asked or decide to do, and haven't finished,
lives in a file, not in your context:

- **Record it first, then act.** Any instruction from `manager-chat` or the
  owner, any wake or copy-in a box is owed, any launch you hold (load, disk,
  slots) with nothing on GitHub to show it, any check to make later:
  `scripts/queue add "<what>" --ref <issue or box> --owner-words "<their
  words>" --after "<condition>"`. Quote the owner's own words.
- **GitHub is already the queue for issues:** an issue labelled
  `status/ready` waiting for a slot needs no entry. Don't duplicate it.
- **Work it:** at start (§4), on every heartbeat and whenever a hold lifts
  (load, disk), run `scripts/queue list` and act on what's open, oldest
  first. Mark each `scripts/queue done ID "<what happened>"`, or `drop ID
  "<why>"`. Never leave a finished entry open.
- **Report it:** the table's top note says how many are open and the oldest
  one's age. Tell `manager-chat` when an entry has been open over an hour
  with its reason.
- It is a local file (`~/.local/state/discobox-manager/queue.jsonl`), so it
  survives a restart of the loop. If it's ever lost, rebuild what you can
  from GitHub and ask the owner for the rest.

## 1. Watching

`discobox-monitor status`. Enable whatever of the `watch` skill's monitors is
missing (the list there is complete: GitHub, workers, submit requests,
disk), and disable instances for repositories no longer in `manager.yaml`,
and any `site-actions`, `site-chat`, `artifact-sync` or `artifact-flush`
instance left from before the site was removed (owner, 2026-11-07). A `github-repo`
instance failing with 401 keeps the token it was enabled with: once
`discobox-access list` shows `GH_TOKEN`, `disable` and `enable` it again
(`--update` is not enough), then rebuild from GitHub (§3) for the gap. Then drain what queued
while no session was running: `discobox-monitor pop`, and keep the events for
§4.

## 2. Which repositories are migrated

For each repository in `manager.yaml`:

```sh
gh api "repos/<repo>/labels?per_page=100" --paginate --jq '.[].name' | grep -c '^status/'
```

A repository is migrated when it has every `status/*` and `type/*` label
(`docs/labels.md`). **In one that isn't, every open issue looks new, and
none is.** Start no triage there. Its row on the table is "label migration".

## 3. Rebuild the table

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
- **A community PR** (author not an owner, member or collaborator): never
  merged or run. No issue named: ask the owner whether to back-populate one,
  else comment and close it. An issue named: no row, unless one of our PRs for
  that issue is open (comment naming ours as its replacement, and close it) or
  the issue was rejected (comment why, and close it) (`docs/gates.md`).
- **A maintainer's PR with no issue:** row "needs an issue".
- **A PR from a box of yours that merged, with its issue still open:** close
  the issue (`github` skill) and retire the box.
- **A finished box** (its PR merged or closed, a triage or job `ready` with
  nothing left, or tagged `to-delete` by an older manager): archive it
  (`workers`, Retire).

Write the table (`scripts/table`, `table` skill) and its slots line
(`scripts/table slots`); the owner reads it in the side pane.

## 4. First actions

If `workers.paused` is true in `manager.yaml`, start no new boxes except for
the issues in `workers.pausedExcept`. Work already in progress carries on as
usual: rebases, CI fixes, answering its prompts, retiring it. Say on the table
that intake is paused.

Handle the events from §1, then work through the gates (`docs/gates.md`), in
this order, within `workers.max` and `disk.minFreeGiB`:

1. **Unmigrated repositories:** start one `migrate-labels` worker per
   repository (`workers`, Launch). Its plan comes to the owner in its box.
2. **What's waiting on a worker you hold:** rebase, fix CI, answer
   mechanical prompts.
3. **`status/ready` issues** with a free slot.
4. **New issues** in migrated repositories: triage, at most
   `workers.triageMax` at once, flakes first, then the release milestone's,
   then highest `priority/*`, then newest (`docs/labels.md`, Next up).
   Do it again after every event you handle: an open issue with no
   `status/*` label and no triage box gets one now (`triage-intake`; a row
   alone is not triage). And read the screen of every worker that went idle
   without a PR: a question can arrive as an idle "done" event, not only as
   "waiting on a question" (the #582 worker sat on one for two hours,
   2026-11-07). A question there gets its "box needs input" row, or your
   answer if it's mechanical.

Update the rows that changed (`scripts/table`).

## 5. Wait

Start the Monitor tool streaming `discobox-monitor pop --follow` (`watch`
skill), create its 10-minute CronCreate safety net (`watch`, re-arming) if
`CronList` doesn't already show it, and the hourly main-install check
(`workers`, Main builds install) if `CronList` doesn't show that either, and go to the loop's step 2 (`AGENTS.md`). Send `manager-chat`
(SendMessage) one line: the loop is up, and the first "Your move". Then say
nothing to it unless it asks, or the owner has a new move it should hear of
before the table shows it. Don't write a status message in your own transcript
either, at startup or after any event (Talking with manager-chat).
