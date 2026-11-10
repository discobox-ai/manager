---
name: stop
description: Stop the whole factory so nothing burns tokens — the loop session ends, every worker box the manager leads is stopped (not archived, not cleaned up), nothing new starts, and the chat stays quiet. Use when the owner says /stop, "stop the factory", "stop everything", or wants every agent idle. /resume brings it all back.
---

# Stop the factory

The owner's words (2026-11-10): "stop means just stop, not delete or clean
up, it's more like pause, but not pause because I want the agents to go
completely idle and not burn anymore tokens."

So: **every agent ends, all work is kept**. Nothing is archived, no branch,
PR, issue, label, tag or credential is touched, nothing is filed or tidied,
no worker gets a last message. `/resume` puts it all back. Run this in
`manager-chat`, yourself, without asking the loop (it may be the thing
that's stuck), and without asking the owner to confirm: `/stop` is the
confirmation.

`/stop` leaves the owner's own boxes running (`job=prototype` or
`job=adhoc`, and any box the manager doesn't lead): the owner is working in
them, and stopping one ends the session they're in. `/stop all` stops those
too.

## 1. Flag it

Set `workers.stopped: true` in `manager.yaml`, with the time, then commit
and push (`github`, pushing this repository). The flag is what keeps it
stopped: `scripts/launch` refuses to start a box, `/start` doesn't launch
the loop, and `start-loop` stops at once, until `/resume` clears it.

```sh
sed -i 's/^  stopped: .*/  stopped: true   # owner, '"$(date -u +%FT%RZ)"': \/stop/' manager.yaml
```

## 2. End the loop

```sh
claude agents --json | jq -r '.[] | select(.name=="manager-loop") | "\(.id) \(.status)"'
claude stop <id>
```

Don't message it first: a stop is not a hand-off, and whatever it was in
the middle of stays where it was (GitHub and the boxes' tags still hold the
state, `docs/state.md`). Its cron safety net and its Monitor stream are
session-only and end with it. The `discobox-monitor` instances keep queuing
events, which costs no tokens; the loop reads the queue on `/resume`.

A git command cut off by the stop can leave `.git/index.lock` behind in
`/workspace/manager`: once no `git` process is running, remove it.

## 3. Stop the boxes

Every box this box leads that is up (running, starting or suspended):

```sh
discobox ls --parent me -o json | jq -r '.sandboxes[]
  | select(.runtime.displayState | IN("running","starting","suspended"))
  | [.id, .runtime.displayState, (.runtime.agentStatus.meta.tags.job // "-")] | @tsv'
```

Leave out `job=prototype` and `job=adhoc` unless the owner said `/stop all`.
For each of the rest, mark it, then stop it:

```sh
discobox tag <id> factory-stopped          # before the stop: tagging a stopped box starts it
discobox stop <id>
```

The tag tells `/resume` which boxes it stopped, so boxes that were already
stopped (waiting on the owner, `pauseAfter`) stay stopped on resume. A
worker's own sleep timer (`discobox-power sleep --wake-in`) belongs to a
sleeping box, not a stopped one; check anyway (§4).

The merge box and any tag box are stopped like the rest. A credential
request still waiting stays waiting; the box asks again when it starts.

## 4. Check

```sh
discobox ls --parent me -o json | jq -r '.sandboxes[]
  | select(.runtime.displayState | IN("running","starting"))
  | [.id, (.runtime.agentStatus.meta.tags.job // "-")] | @tsv'
```

Only the owner's boxes you left out may be listed. Check again a few
minutes later: a box that came back up (a wake timer, a tag write) gets
`discobox stop` again, and the owner hears its ID.

## 5. Say so, then stay quiet

One message to the owner: stopped; how many boxes; the owner's boxes left
running, by ID, and that `/stop all` stops them; anything that was midway
and worth knowing on resume (a tag box waiting for approval, a validation
run cut short, whose timing will need a fresh run). Then say nothing until
the owner speaks. Don't check, poll, schedule wakeups or watch anything
while stopped: that's what stopping is for.
