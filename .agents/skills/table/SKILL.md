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
- **Finished boxes** get no row: you archive them yourself (`workers`, Retire).

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

**Slots** (owner, 2026-11-03): the top of the pane, site and artifact shows
"N/max running" and one line per running worker. Run `scripts/table slots`
(it reads `discobox ls`) on every worker `box.state` event that starts or
stops a box, and on each heartbeat.

## The manager site

`site/` (Remix 3) serves the same table on port 4400, started at boot by
`.discobox/services/manager-site`: "Your move" rows first, each issue and PR
expandable to its body, checks, files and comments (read live from GitHub,
read only), and a diff page per PR with Contract, Docs, Implementation and
Lines tabs (`site/README.md`). It also gives the owner buttons on each row: close or reject a
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

## Chat

The site and the artifact both open on an inbox whose first entry is a chat
with you: one thread, the owner's messages in
`~/.local/state/discobox-manager/chat.jsonl`, which the `site-chat`
monitor watches (the artifact's reach it through the sync, like its
buttons). A message is the owner speaking, as if typed to you here: act on
it by the gates (`docs/gates.md`), then answer **in the thread**, always,
even when there's nothing to do but say so:

1. `scripts/chat list`: the messages with no reply yet (`show` for the
   thread, to see what came before).
2. Do what it asks, or find out what it asks about.
3. `scripts/chat reply <id> "<answer>"`: plain text, short, what you did or
   what you found. A reply goes to `chat-replies.jsonl`, which wakes no one,
   and shows on the page within seconds (the artifact's at its next sync).

Several waiting messages get one reply each, oldest first. A question that
needs the owner's decision is still answered here, with the options; it
also goes on the table if it holds up work.

## The status artifact

"Manager status" (https://claude.ai/code/artifact/21128720-e384-4249-a3d0-9b8b6b5e7923)
shows the same view anywhere the owner is signed in to claude.ai. Its
database is fed by `site/sync.ts` (service `manager-sync`) through a sync
agent you run in the background (Agent tool, `model: haiku`: the job is
mechanical): it watches
`artifact-sync/changed.log` with a Monitor, sends each outbox batch with the
Artifact tool's `write_db` (`db_op` batch, the file's `writes`), deletes the
file, then pulls `actions` with status `pending` into `artifact-sync/inbox/`
and marks them `received`. `sync.ts` turns inbox files into `actions.jsonl`
lines, so they reach you like the site's buttons.

The site and the artifact are one app (`site/README.md`): `npm run build` in
`site/` makes both, and the artifact is that build's
`site/dist-artifact/artifact.html`, never hand-edited. The site runs in
dev mode, so a saved change is live on it at once. After a change to
`site/app/` is pushed, `npm run build` in `site/`, then republish: the Artifact tool on that file with `url` set to the artifact's
URL and no `capabilities`, so its database and user grants carry forward.
Its stored rules, to restate in full if a collection is ever added: `rows`,
`details`, `meta`, `actionsDone`, `diffs`, `diffParts` and `chat` read `view`, write
`admin`; `actions` read `view`, write `interact`; plus `user: {}`.

The site keeps no state of its own and commits nothing: lose the box and
`start-loop` rebuilds the table.

## When it changes

Update the row every time it changes, including a worker resuming after the
owner answered it. In chat, say something only when the owner has a new
move, or when they ask; one line, not the table. When the owner asks where
things stand, answer from `scripts/table show` in a few lines.
