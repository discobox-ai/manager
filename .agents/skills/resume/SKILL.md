---
name: resume
description: Bring the factory back after /stop — clear the stop flag, start the boxes /stop stopped, and relaunch the loop, which picks up from GitHub, the boxes' tags and the queued events. Use when the owner says /resume, "resume", "start the factory again", or "carry on" after a stop.
---

# Resume the factory

Run in `manager-chat`. The reverse of `stop`, in this order, so the boxes
are up before the loop looks at them.

## 1. Clear the flag

Set `workers.stopped: false` in `manager.yaml`, then commit and push.

```sh
sed -i 's/^  stopped: .*/  stopped: false/' manager.yaml
```

Remove a leftover `/workspace/manager/.git/index.lock` first if no `git` is
running (`stop` §2).

## 2. Start the boxes `/stop` stopped

```sh
discobox ls --parent me --tag factory-stopped -q
```

For each: `discobox start <id>`, then `discobox tag <id> --rm
factory-stopped`. Start them one at a time, a few seconds apart, not all at
once, and keep to `workers.max`: past it, start the rest as the loop frees
slots (leave their tag on until then; the loop does it). Boxes that were
already stopped before `/stop` have no tag and stay as they were.

A box's harness restarts with its conversation; the loop types it a
nudge when it reads it idle (`workers`, Waking a box).

**Long-lived boxes need re-arming at once** (2026-11-24): merge-gate,
merge-queue, merge-score, pr-check and Norm lose their watches and Monitors
with the stop. Started and left alone, they sit idle, the 30-minute idle
rule stops them again, and no PR gets a Process check, a score or its
approval handed to the queue. Right after starting each one, type it a line
to re-arm its watch per its skill and rescan now, and check it answers.

## 3. Relaunch the loop

`start` §4: `claude --bg -n manager-loop ... "/start-loop"`. It rebuilds
everything from GitHub, the tags and the queued events, as after any
restart (`docs/state.md`), and re-arms its Monitor and cron safety net. Tell
it, by SendMessage once it's up, that this is a resume after `/stop` at
<time>: boxes it reads idle mid-job get one line to carry on, a validation
run cut short starts again, and nothing that happened while stopped is
assumed.

## 4. Say so

One line to the owner: resumed, how many boxes started, the loop's id.
