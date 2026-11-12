---
name: table
description: The manager's single status table for the owner — its columns, ranking and update rules. Use whenever reporting status, after any row changes, or when the owner asks where things stand.
---

# The table

Status and to-do are one table, ranked. It lives in a file the owner's
`manager-table` mod draws as a side pane, with the first "Your move" in a band
above the prompt (owner, 2026-11-03). **Don't post it in chat**: the pane is
the table. Each row has:

`Item`, `Agent`, `Issue`, `PR`, `Doing`, `Your move` and `Why this rank`.

- **Item** is a plain description, with no numbers in it.
- **Agent** is the worker's box ID, **Issue** and **PR** are bare numbers
  (`vm 27` for another repository). Each is `-` when it doesn't apply.
- **Doing** says what the agent is doing logically: working, waiting for you,
  waiting on CI, done. Never whether its box is running or stopped: workers
  sleep whenever they wait, so asleep is normal.
- **Your move** is `–` unless the owner has something to do:
  - "Review and merge", only once every check on the PR's head is green,
    the process comment for that head is posted (`github` skill), **and the
    PR is out of draft**. A green draft whose worker is done goes back to its
    worker to mark it ready (owner, 2026-11-07, PR 782); the row stays `–`
    until it is.
    Never "review and merge once green".
  - "Look at it" for a failing PR its worker can't make green.
  - "Answer in the box" for a box tagged `needs-input` (or showing a question
    it didn't tag; tag it first, `workers`).
  - A concrete decision ("Decide A or B on the issue"). Before asking the
    owner anything about an issue (a milestone, a choice), read its comments:
    the owner often answered there already (#876, 2026-11-09).
  - An ADR PR that's green is "Review and merge": merging it accepts it.
- **The merge queue** is the rows at "Review and merge", in rank order.
  Every PR in it is kept rebased: after every merge or close, recheck them
  all and rebase at once any that conflicts, even with every slot full (the
  rebase wakes its own worker). The owner merges in any order (owner,
  2026-11-05; the top-3-only rule let 656, 690 and 697 sit conflicted).
- **Why this rank:** written by `scripts/table rank` ("2 v0.19 Release
  (high)"), from labels and milestones; see Editing it. A blocker no label
  marks (broken CI, a release-validation finding, an issue holding up a
  milestone one) gets `blocker=yes`. Within a group and priority, order by
  how much a row unblocks (critical path first) with `move`.
- **Ad-hoc boxes** get a row too: Item is the owner's topic, Doing "owner
  working" ("owner prototyping" for a prototype box), Your move `–`, until `submit` gives it an issue.
- **Finished boxes** get no row: you archive them yourself (`workers`, Retire).

## Editing it: `scripts/table`

Change only what changed, by row key; never rewrite the file. The key is
the row's issue (`460`, `vm 33`), else its PR (`pr 372`), else a name
(`finished`).

```sh
scripts/table set 460 doing="ADR PR green" move="Review and merge" pr=463
scripts/table add 461 item="…" agent=sbx_… doing="Working: triage" --before finished
scripts/table rm 411 "pr vm 31"
scripts/table move 460 --at 1     # only among rows of the same group and priority
scripts/table rank                # re-read labels and milestones from GitHub, re-sort
scripts/table set 525 blocker=yes # group 1 when no label says so (broken CI)
scripts/table link 463 https://github.com/discobox-ai/discobox/pull/463
scripts/table show
```

**The order is computed, not placed** (owner, 2026-11-04). Every write
sorts the rows by group (1 Blocker, 2 the release, 3 the next release,
4 Other, 5 Done; `docs/labels.md`, Next up), then by `priority/*`, keeping
your order among equals. `rank` reads each row's labels, milestone and
state from GitHub and writes its group, priority and `why`; a new row is
ranked as it's added. Run `scripts/table rank` (or `rank KEY`) after any
change to a label, a milestone or `manager.yaml`'s `release`, and at the
start of the loop. A row whose issue is closed lands in Done: remove it.

**Focus comes first** (owner, 2026-11-12). Group 0, above blockers, is the
streams in `manager.yaml` `focus`, in the owner's order. Within a stream, rows
with an owner move come first, then priority. A row is in a stream when its
issue or PR is listed there, or when it carries `stream=<name>`. Whenever you
file or start an issue for a focus stream (from its plan PR, a follow-up, a
worker's side finding that blocks it), add `stream=<name>` to its row in the
same write. Workers for focus rows take free slots before anything else.
Only the owner adds or removes a stream; when a stream's issues are all
closed, tell the owner and ask what's next.

Fields: `item agent issue pr doing move why blocker`. `move` is "Your move", `–`
when there's none. Issues, PRs and boxes are links in their rows (boxes as `discobox:///<id>`);
there's no link list under the table (owner, 2026-11-03). The file is `~/.local/state/discobox-manager/table.json`; the
command writes it atomically and stamps it, and the pane turns "Stale" when
it's 15 minutes old.

**Slots** (owner, 2026-11-03): the top of the pane shows
"N/max running" and one line per running worker. **Running means the box's
power state is `running` or `starting`, nothing else:** a suspended (paused),
stopped, asleep or archived box is not running and never counts, whatever its
job or row says (owner, 2026-11-05, restated 2026-11-12). Every `scripts/table`
write refreshes the slots from `discobox ls`. Run `scripts/table slots` too on
every worker `box.state` event that starts, pauses or stops a box, and on each
heartbeat. When deciding capacity, count from a fresh `scripts/table slots`,
never from a remembered number.

## The side pane

The side pane is the owner's only view of the table: the manager site and
the status artifact were removed (owner, 2026-11-07). It is the
`manager-table` mod, kept in
`.agents/skills/start/mods/manager-table/` and copied into the manager's
session by `/start` (§3). Change it there, then copy it into the session again
(`cp -r`); the session reloads it when the turn ends.

## The release status issue

Each release has one issue in discobox-ai/discobox, titled `v<X.Y> release
status`, in that release's milestone, labelled `type/chore`,
`status/in-progress` (owner, 2026-11-07; v0.19's is discobox#826). **Its
body is the status**: you rewrite the whole body whenever the release's
state changes (a candidate cut, a validation verdict, a blocker filed or
closed, the owner's next move), with
`gh api -X PATCH repos/discobox-ai/discobox/issues/<N> --input <json>`
(`{"body": ...}`). Never post status as comments, and keep the first line
`**Status: <one phrase>** (updated <date> by the manager)`.

Sections, in order: Next (numbered, each owner step marked **Owner**),
Milestone (counts, not counting this issue; what's in flight), Candidates
(one row per rc: commit, tracking issue, result), Startup latency (the
latest timing table), Known and accepted, Since the last candidate (what
main has that it doesn't). Write issue numbers in full outside discobox's
own (`discobox-ai/release-validation#19`).

Open the next release's issue when its milestone gets its first issue; close
this one when the release is tagged **and its docs are live on discobox.ai**
(`workers`, Release docs), with the final status as its body.
Don't triage it or start a worker for it.

## When it changes

Update the row every time it changes, including a worker resuming after the
owner answered it.

**The row first** (owner, 2026-11-04). When an event changes what the owner
should do (a PR merged or closed, a PR green, an answer given, a box
asking), update its row before any follow-on work: retiring the box,
starting the next worker, rebasing others. A "Your move" the owner has
already done is the table's worst failure. When several events wait, clear
the stale moves for all of them first, then act on each. In chat, say something only when the owner has a new
move, or when they ask; one line, not the table. When the owner asks where
things stand, answer from `scripts/table show` in a few lines.
