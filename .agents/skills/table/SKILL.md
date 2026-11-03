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
  - "Review and merge", only once every check on the PR's head is green and
    the process comment for that head is posted (`github` skill).
    Never "review and merge once green".
  - "Look at it" for a failing PR its worker can't make green.
  - "Answer in the box" for a box tagged `needs-input` (or showing a question
    it didn't tag; tag it first, `workers`).
  - A concrete decision ("Decide A or B on the issue").
  - An ADR PR that's green is "Review and merge": merging it accepts it.
- **The merge queue** is the rows at "Review and merge", in rank order. Only
  its top 3 get rebased when they conflict (`workers`, Rebases).
- **Why this rank:** rank by how much a row unblocks (critical path first),
  then by how hard the decision is to reverse.
- **Ad-hoc boxes** get a row too: Item is the owner's topic, Doing "owner
  working" ("owner prototyping" for a prototype box), Your move `–`, until `submit` gives it an issue.
- **Finished boxes** the owner should delete get one row of their own. Check
  that each still exists first.

## Editing it: `scripts/table`

Change only what changed, by row key; never rewrite the file. The key is
the row's issue (`460`, `vm 33`), else its PR (`pr 372`), else a name
(`finished`).

```sh
scripts/table set 460 doing="ADR PR green" move="Review and merge" pr=463
scripts/table add 461 item="…" agent=sbx_… doing="Working: triage" --before finished
scripts/table rm 411 "pr vm 31"
scripts/table move 460 --at 1
scripts/table link 463 https://github.com/discobox-ai/discobox/pull/463
scripts/table show
```

Fields: `item agent issue pr doing move why`. `move` is "Your move", `–`
when there's none. Links go under the table, one per issue or PR, never
inline. The file is `~/.local/state/discobox-manager/table.json`; the
command writes it atomically and stamps it, and the pane turns "Stale" when
it's 15 minutes old.

## The manager site

`site/` (Remix 3) serves the same table on port 4400, started at boot by
`.discobox/services/manager-site`: "Your move" rows first, each issue and PR
expandable to its body, checks, files and comments (read live from GitHub,
read only). It also gives the owner buttons on each row: close or reject a
PR, close an issue, prioritize, or a free-text instruction. A button only
records the action, as one line in
`~/.local/state/discobox-manager/actions.jsonl`; the `site-actions` monitor
wakes you. Then:

1. `scripts/action list`: the pending actions, with their row, repo, issue
   or PR, and reason.
2. Carry each out as the owner's own instruction (`github` skill for
   closing; `docs/gates.md` for what follows, e.g. retiring a worker whose PR
   was rejected). A free-text instruction is the owner speaking; act on it
   as if they had typed it to you.
3. `scripts/action done <id> "<what you did>"`; the site shows it done.

The site keeps no state of its own and commits nothing: lose the box and
`start-loop` rebuilds the table.

## When it changes

Update the row every time it changes, including a worker resuming after the
owner answered it. In chat, say something only when the owner has a new
move, or when they ask; one line, not the table. When the owner asks where
things stand, answer from `scripts/table show` in a few lines.
