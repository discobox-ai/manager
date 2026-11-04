---
name: start
description: The manager's one entry point — start (or restart) everything from nothing: access, the box's services (the site and the artifact sync), the side-pane mod, watching, the owner's waiting buttons and chat, the status table rebuilt from GitHub and its workers' tags, the artifact's sending, the first actions, and waiting for events. Use when the manager's box starts (its launch prompt is /start), in any new session that is to be the manager, after a restart, or whenever the owner says /start.
---

# Start

Run this in the one session that is the manager. Everything it needs is in
GitHub, on its boxes' tags and in `~/.local/state/discobox-manager/`
(`docs/state.md`); nothing from an earlier session is assumed, so the owner
can delete every session and start a new one with `/start`. Safe to run again
at any time: every step checks before it acts.

**One manager session.** Two sessions both running the loop would answer the
same events twice. If another session is already the manager (it's woken by
the same monitors and writes the table), say so in one line and stop unless
the owner says this one replaces it; then that one should be closed.

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
their skills from the pushed `main`. Changes another session left uncommitted
are that session's: say so, and don't commit them for it.

## 3. The box's services

The owner's site and the artifact's sync are discobox services, declared in
`.discobox/services/` and started by discobox when the box boots, in dev mode
(`site/README.md`). Nothing restarts one that exits. Check both:

```sh
curl -sf -o /dev/null localhost:4400/api/state && echo site up
# the sync writes relay.json every cycle (60 s)
find ~/.local/state/discobox-manager/artifact-sync/relay.json -mmin -3 | grep -q . && echo sync up
```

One that's down: start it by hand, detached, from the repository root, and
tell the owner in one line (it comes back by itself at the next boot):

```sh
setsid nohup .discobox/services/manager-site > ~/.local/state/discobox-manager/site.log 2>&1 < /dev/null &
setsid nohup .discobox/services/manager-sync > ~/.local/state/discobox-manager/sync.log 2>&1 < /dev/null &
```

Never start a second copy of one that's up: `ss -ltnp | grep :4400` and
`pgrep -f 'remix/node-tsx sync.ts'` say whether it is.

## 4. The side pane

The table's side pane is the `manager-table` mod, kept in this skill's
`mods/` folder (the repository is its home: edit it there). A session loads
a mod only from its own mods folder, so each new manager session gets a copy:

1. Load the `plugin-authoring` skill (Skill tool). It names this session's
   mods folder (`~/.claude/dev-mods/<this session's id>/`).
2. Copy each folder in `.agents/skills/start/mods/` into it, unless an
   identical copy is there (`diff -r`), e.g.
   `cp -r .agents/skills/start/mods/manager-table <mods folder>/`.
3. Claude Code asks the owner, once per session, "Turn on the mods Claude
   writes in this session?" Say in one line that the table pane needs
   "Turn them on". After that the session loads it on every resume.

The pane opens by itself only in a terminal at least 144 columns wide;
`/table-pane` opens it at any width. The `artifact-sync` mod beside it is a
prototype that sends the artifact's outbox without a model; it does nothing
unless `artifact-sync/mod.on` exists, so leave that file alone unless the
owner turns it on.

## 5. Watching

`discobox-monitor status`. Enable whatever of the `watch` skill's monitors is
missing (the list there is complete: GitHub, workers, the site's buttons and
chat, the artifact's flushes and stalls, submit requests, disk), and disable
instances for repositories no longer in `manager.yaml`. Then drain what queued
while no session was running: `discobox-monitor pop`, and keep the events for
§9.

## 6. What the owner left waiting

Buttons pressed and chat sent while no session ran are still on file:

- `scripts/action list`: carry out each pending action (`table` skill, The
  manager site).
- `scripts/chat list`: answer each message in the thread (`table` skill,
  Chat), oldest first, even if only to say you're back and on it.

## 7. Which repositories are migrated

For each repository in `manager.yaml`:

```sh
gh api "repos/<repo>/labels?per_page=100" --paginate --jq '.[].name' | grep -c '^status/'
```

A repository is migrated when it has every `status/*` and `type/*` label
(`docs/labels.md`). **In one that isn't, every open issue looks new, and
none is.** Start no triage there. Its row on the table is "label migration".

## 8. Rebuild the table

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
(`scripts/table slots`); the owner reads it in the side pane, on the site and
in the artifact.

## 9. The artifact

Nothing reaches the "Manager status" artifact while no session sends it
(`table` skill, The status artifact). Start one sync pass now (Agent,
`model: haiku`, `run_in_background`, the pass brief in the `table` skill) if
`artifact-sync/outbox/` holds anything or `scripts/chat list` showed messages
from the artifact; after that the `artifact-flush` and `artifact-sync`
monitors start them (`watch`).

To republish the page later from this session (after a change to
`site/app/`), read the artifact first (Artifact tool, `action: read`, its
URL): a session may update an artifact only after it has read it.

## 10. First actions

If `workers.paused` is true in `manager.yaml`, start no new boxes except for
the issues in `workers.pausedExcept`. Work already in progress carries on as
usual: rebases, CI fixes, answering its prompts, retiring it. Say on the table
that intake is paused.

Handle the events from §5, then work through the gates (`docs/gates.md`), in
this order, within `workers.max` and `disk.minFreeGiB`:

1. **Unmigrated repositories:** start one `migrate-labels` worker per
   repository (`workers`, Launch). Its plan comes to the owner in its box.
2. **What's waiting on a worker you hold:** rebase, fix CI, answer
   mechanical prompts.
3. **`status/ready` issues** with a free slot.
4. **New issues** in migrated repositories: triage, at most
   `workers.triageMax` at once, flakes first, then highest `priority/*`, then newest.

Update the rows that changed (`scripts/table`).

## 11. Wait

Start the Monitor tool streaming `discobox-monitor pop --follow` (`watch`
skill), and go to the loop's step 2 (`AGENTS.md`). Say one line to the owner:
started, what needs them (the first "Your move"), and anything §3 or §4 needs
from them.
