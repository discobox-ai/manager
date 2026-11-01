---
name: watch
description: How the manager watches GitHub and its workers and gets woken — discobox-monitor instances and one waiting pop. Use at the start of every session, and when an event arrives or watching seems to have stopped.
---

# Watch

The manager is woken by **events**, never by polling in its own turns.

## The target (once discobox#414 and #427 land)

Enable, once per box (instances survive restarts; `discobox-monitor status`
lists them):

```sh
# One per repository in manager.yaml `repos`. head= follows workers' PR checks; branch= keeps CI to the default branch.
discobox-monitor enable github-repo --name gh-discobox -o repo=discobox-ai/discobox -o head='discobox/*' -o branch=main
discobox-monitor enable github-repo --name gh-vm       -o repo=discobox-ai/vm       -o head='discobox/*' -o branch=main
discobox-monitor enable github-repo --name gh-manager  -o repo=discobox-ai/manager  -o head='discobox/*' -o branch=main
discobox-monitor enable github-repo --name gh-review   -o repo=discobox-ai/review   -o head='discobox/*' -o branch=main
# Workers: idle/busy, state, credential requests (discobox#427).
discobox-monitor enable discobox-box --name workers -o tag=manager=<this box id>
# Disk.
discobox-monitor enable command --name disk -o cmd='df -BG --output=avail / | tail -1' -o every=5m
```

Then keep one `discobox-monitor pop --wait=4h` running in the background (the
Bash tool's `run_in_background`, never a trailing `&`, which detaches it so it
never wakes you). When it returns, handle each event by `docs/gates.md`, then
start the next `pop --wait`. Timing out after 4h is the heartbeat: check disk
and post a one-line "no change" if nothing moved.

Exact option names may differ from these drafts once #414 and #427 land.
Check `discobox-monitor show <monitor>` and update this skill.

## Until then

The built-in `github-repo` works today without `head`, `branch` or conflict
events. `reference/orchestrate.sh` (`watch`, `github`, `idle`, `approve`)
shows how the old lead polled all of this, and its `watch` exits on any change
and must be restarted every time. Prefer `github-repo` instances now for
issues and PRs, plus a small polling script of your own for worker idle state
and credential requests. The old script's `idle` and `approve` are a starting
point.

## Start of every session

1. `discobox-monitor status`. Re-enable anything missing, and disable
   instances for work that's finished.
2. `discobox-monitor pop` (no wait) to drain what queued while you were away.
3. Rebuild the table (`docs/state.md`) and post it.
4. Start the waiting `pop`.
