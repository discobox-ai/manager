---
name: recover
description: Bring the manager back after the host restarted or something crashed, without a /stop: relaunch the loop, start the long-lived boxes and have them re-arm their watches, wake the workers that were mid-job, re-check monitors, crons and credentials. Use when the owner says "the host restarted", "everything is down", "restart the manager", or when boxes are found stopped that nobody stopped.
---

# Recover after a restart

`stop` / `resume` is the owner's switch. **This is for the other case**: the
host rebooted, the server restarted, or a box was found down that nobody
stopped (2026-11-20: a host restart stopped every box, and the merge gate,
merge queue, pr-check and merge-score boxes came back with no watches).
Nothing is lost, because state lives in GitHub, box tags, the event queue
and `scripts/queue` (`docs/state.md`): it needs starting, then re-arming.

Run in `manager-chat`; it hands the loop its part. Never purge anything,
never touch the owner's own boxes (adhoc, prototype) except to tell him
they're down, and keep any pause the owner set (`workers.paused`,
`pausedExcept`, `stopped-for-archil.json`): a restart doesn't lift it.

## 1. Look: `scripts/recover`

It prints the host (load, disk, the pause flags), whether `manager-loop`
and `manager-chat` are up, which long-lived boxes are down, the workers that
were mid-job and stopped, what's parked on purpose, the open to-do count,
and the credentials. Read it before starting anything.

## 2. Host first

Load below `disk.maxLoad`, disk above `disk.minFreeGiB`. If not, start only
the infra boxes (step 4), not workers, and say why. A server that isn't
answering (`discobox ls` fails) is a different problem: tell the owner.

## 3. The loop

`manager-loop` not running: relaunch it (`start` §4, `claude --bg -n
manager-loop … "/start-loop"`). It rebuilds the table from GitHub and the
tags, re-enables its monitors and Monitor stream, and re-creates its crons
(`watch`, `start-loop` §1 and §5). Tell it by SendMessage this is a recovery
at <time>, so it re-checks every monitor (`discobox-monitor status`), runs
`scripts/queue list`, and doesn't assume any event arrived while down.

## 4. The long-lived boxes, one at a time

`scripts/recover --start` starts the merge gate, merge queue, pr-check,
merge-score and Norm boxes down, five seconds apart. Each has lost its
watches, monitors and background processes (a restart ends them), so type
one line into each after it's up:

> The host restarted. Your monitors, watches and background processes are
> gone: re-arm everything your skill says (§ Watch / § Watching), rescan,
> and carry on. Don't redo anything already done.

- **Merge gate, merge queue:** re-ask no credential unless it's lapsed
  (`discobox-access list`). If a Claude "Login expired" prompt shows, type
  `continue` (`workers`, Mechanical prompts).
- **Norm:** its stream script, mentions monitor and snapshot clock are gone
  too; it re-arms them from its skill, and checks whether it should be asleep
  (§ Sleep, 01:00 to 16:00 UTC).
- **Check each one answered**, not just started: a box tagged running that
  prints nothing is stuck.

## 5. Workers that were mid-job

`scripts/recover` lists stopped or suspended workers with no
`ready`/`needs-input`/`blocked` tag: they were working. Start them one at a
time within `workers.max`, newest PR first, and type: `The host restarted
mid-job; read your PR/issue state and carry on.` Skip the ones the owner's
pause covers (`stopped-for-archil.json`, a pause with `pausedExcept`): record
them in `scripts/queue` instead. Boxes tagged `ready`, `needs-input` or
`blocked` were waiting anyway: leave them, and don't wake them.

## 6. The manager's own side

- `discobox-monitor status`: every watch instance enabled, the `workers`
  monitor running (`watch`), and the Monitor stream up with its 10-minute
  safety-net cron (`CronList`).
- The other crons: the 15-minute Norm snapshot, the hourly main-install.
- `scripts/pr-review-labels --apply`, `scripts/stuck-drafts`,
  `scripts/stale-in-progress`, `scripts/table sync`.
- `scripts/queue list`: act on what's open.

## 7. Say so

One line to the owner: what was down, what you started, what needs him (his
own boxes down, a credential lapsed, a pause still on). Then record in
`scripts/queue` anything started late or still owed.
