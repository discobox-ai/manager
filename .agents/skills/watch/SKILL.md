---
name: watch
description: How the manager watches GitHub and its workers and gets woken — discobox-monitor instances and one waiting pop. Use at the start of every session, and when an event arrives or watching seems to have stopped.
---

# Watch

The manager is woken by **events**, never by polling in its own turns.

## Monitors

Enable these once per box (instances survive restarts; `discobox-monitor
status` lists them). Two `github-repo` instances per repository in
`manager.yaml`, because `head` and `branch` narrow everything an instance
sees: with them set it reports only matching PRs and that branch's runs,
not issues or anyone else's PRs (checked 2026-11-02).

```sh
eval "$(discobox-access env)"   # github-repo reads GitHub with GH_TOKEN
for r in discobox vm manager review; do
  # Every issue and PR: new issues to triage, PRs without an issue, comments, merges.
  discobox-monitor enable github-repo --name gh-$r      -o repo=discobox-ai/$r -o watch=issues,prs -o interval=1m
  # Workers' PRs (from the bot's forks, so by author, not branch) with their
  # checks and conflicts, and the default branch's CI.
  discobox-monitor enable github-repo --name gh-$r-work -o repo=discobox-ai/$r -o author=ibuildthecloud-bot -o branch=main -o interval=2m
done
```

**Intervals** (2026-11-18: the bot's 5000 REST calls an hour, shared by every
box, ran out twice with every instance at the 1-minute default): discobox and
vm at 1m (`-work` 2m); site and release-validation 5m; every other
repository 10m, both instances. Set them with `enable --update`. Never have a
second box (merge-gate, merge-queue, pr-check, merge-score, a prototype) watch what these
already watch at a short interval. When the bot runs out again, measure
before guessing: `x-ratelimit-used` from a cheap GET every 5 minutes.

```sh
# Workers: state, primary terminal busy/idle, secret requests.
discobox-monitor enable discobox-box --name workers -o created-by=me
# Disk.
discobox-monitor enable command --name disk -o cmd='df -BG --output=avail / | tail -1' -o every=5m
```

A worker's PR shows up in both `gh-<repo>` and `gh-<repo>-work`; act on an
event once (same `url` and `kind`). Add or drop a pair when `manager.yaml`'s
repositories change. `discobox-monitor test <monitor> -o … --since 12h`
replays a past window without enabling anything, to check an option.

Then stream the queue with **one** Monitor tool (owner, 2026-11-03), not a
background `pop --wait`: each event arrives as it lands, with no gap between
one pop returning and the next starting.

```
Monitor(
  command: "eval \"$(discobox-access env)\"; discobox-monitor pop --follow",
  description: "discobox monitor events (manager: GitHub, workers, disk)",
  timeout_ms: 1800000,
)
```

- Handle each event by `docs/gates.md` as it arrives. `discobox-monitor read
  ID` gives its body.
- A `pr.comment` or `issue.comment` from a worker whose title or body starts
  `**Issue to file**` is a worker handing you an issue: file it (`github`,
  Filing and editing issues).
- Only one pop at a time: never run a bare `discobox-monitor pop` while the
  stream is up, or it takes events away from the stream.
- The Monitor tool expires after 30 minutes. Re-arm it with the same
  command straight away; events that came in meanwhile are still queued.
  **A missed re-arm stops the manager silently**: on 2026-11-09 the stream
  lapsed, no `pop` was running, 15 events sat queued, and v0.19.1-rc.1's
  validation started only when the owner asked. So the loop also keeps a
  safety net, a CronCreate job every 10 minutes (prompt: "watch: is the
  `discobox-monitor pop --follow` stream up? If not, re-arm it now and
  handle what's queued"). It fires only when the loop is idle, which is
  exactly when a lapse goes unnoticed. Create it at start (`start-loop`)
  and check `CronList` on each heartbeat that it still exists.
  Each expiry is the heartbeat: check disk, and say nothing unless something
  changed.
  Also on each heartbeat, **run `scripts/stuck-drafts --wake`,
  `scripts/finished-boxes --retire`, `scripts/stale-in-progress`,
  `scripts/reconcile` (act on every line: `workers`, Reconcile),
  `scripts/waiting-external --apply` (owner, 2026-11-24: an issue waiting
  on an outside party closes after 30 days with no reply, and its label comes
  off as soon as they answer; also run it on any comment event on an issue
  carrying `status/waiting-external`, so a reply doesn't wait for the
  heartbeat; then re-triage the issue, or wake its box if it has one),
  a check that every long-lived box (merge-gate, merge-queue, both
  merge-score, both pr-check) is running (not Norm: it pauses itself
  overnight, 01:00–16:00 UTC, and that's normal); one that isn't gets
  started and typed a line to re-arm its watch (2026-11-24: all of them sat
  stopped after a resume, and nothing reached in-review), and
  `scripts/pr-review-labels --apply`** (also run every 5 minutes by the `pr-labels` command monitor, so it no longer depends on this turn; fix
  each issue it lists: `docs/labels.md`, In progress means a box). The second archives every worker box
  whose PR has merged or closed, or whose issue closed with no PR (owner,
  2026-11-15: ten finished boxes had lingered, one a day). For the first: every
  cron "watch:" turn, every Monitor expiry, and every `scripts/table sync`.
  It finds each open draft PR of ours whose checks have all completed and
  whose box isn't running, starts the box, and types the CI-done nudge
  (finish `open-pr`, mark it ready). A `discobox-power sleep --wake-in` timer
  doesn't fire if the server restarts while it's pending (discobox#1192;
  seen 2026-11-03 and 2026-11-15, when four green drafts sat for 90 minutes).
  It's a rule you run, not a judgement you make: run the script.
  It also lists, without waking, drafts whose box is tagged `blocked` or
  `needs-input` with checks done and no movement for 2 hours (`held:`). For
  each, read the box's screen: if what it waited on has happened (the owner
  tagged, merged or answered; a run published), remove the tag and wake it
  with what changed. Otherwise leave it, and make sure the table says what
  it waits on. And whenever you see a blocker clear yourself (a tag, a
  merge, a publish a worker waits on), un-tag and wake that box then, not
  at the next sweep (2026-11-18: PR 1352 sat 10 hours `blocked` after
  vm/v9 had published).
- While a box waiting on the owner is due to be paused (`workers`, Power),
  check it when it's due rather than waiting for an event.

## Start of every session

Watching is the loop's alone: `start-loop`, in the background session
`manager-loop`, enables the monitors and runs the one Monitor stream. The
chat session (`start`) never pops the queue.
