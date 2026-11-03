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
  discobox-monitor enable github-repo --name gh-$r      -o repo=discobox-ai/$r -o watch=issues,prs
  # Workers' PRs with their checks and conflicts, and the default branch's CI.
  discobox-monitor enable github-repo --name gh-$r-work -o repo=discobox-ai/$r -o head='discobox/*' -o branch=main
done
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
  command: "export DISCOBOX_SERVER=https://api.discobox.internal; eval \"$(discobox-access env)\"; unset DISCOBOX_TOKEN; discobox-monitor pop --follow",
  description: "discobox monitor events (manager: GitHub, workers, disk)",
  timeout_ms: 1800000,
)
```

- Handle each event by `docs/gates.md` as it arrives. `discobox-monitor read
  ID` gives its body.
- Only one pop at a time: never run a bare `discobox-monitor pop` while the
  stream is up, or it takes events away from the stream.
- The Monitor tool expires after 30 minutes. Re-arm it with the same
  command straight away; events that came in meanwhile are still queued.
  Each expiry is the heartbeat: check disk, and say nothing unless something
  changed.
- While a box waiting on the owner is due to be paused (`workers`, Power),
  check it when it's due rather than waiting for an event.

## Start of every session

The `start-loop` skill does it: status, drain, rebuild, then the Monitor
stream.
