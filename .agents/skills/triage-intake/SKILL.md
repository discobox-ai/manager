---
name: triage-intake
description: How the manager handles incoming work — a new issue, an issue the owner points at, or a request in conversation. Use when an issue appears with no status label, or the owner asks for something to be done.
---

# Intake

## A new issue in a watched repository (no `status/*` label)

0. **Only in a migrated repository** (it has the `status/*` and `type/*`
   labels, `docs/labels.md`). In one that isn't, every issue looks new: start
   no triage there, start a `migrate-labels` worker instead (`workers`). And
   only up to `workers.triageMax` triage workers at once, highest
   `priority/*` first (a flake first of all), then newest.
1. Start a triage worker:
   `-p 'Triage issue #N in <repo>.'` (job `triage`, skill `triage-issue`).
2. When it finishes, its verdict is a comment on the issue: proposed
   `type/*`, `area/*` and `priority/*`, a rewritten body if it was thin, and
   whether it needs an ADR or a decision.
3. Apply the verdict by `docs/gates.md`: `status/ready`, `status/triaged`
   or `status/needs-decision`. Retire the triage box.

## The owner asks for something in conversation

- If it's a change to a product repository, **file an issue** (Today / Wanted /
  Done when), then treat it as `status/ready` (the owner asked). Start the
  worker. Don't make the change yourself.
- If it's a question about the state of things, answer from GitHub and the
  workers, not from memory.
- If it changes the process, the change goes into this repository. Edit
  AGENTS.md or a skill, then push with the owner's go-ahead (`github`).

## The owner wants to work on something by hand

Start an ad-hoc box for them (`workers`, Ad-hoc boxes). Nothing is filed yet.
When they say they want to **prototype** something, it's a prototype box
(`workers`, Prototype boxes): the box knows to get it working fast, not
properly.
When they say "submit" (in the box, or "submit box X" to you), the box's
`submit` skill files the issue and says what happens to the code; apply its
comment by `docs/gates.md`.

## The owner says an issue is blocking or urgent

Set `priority/critical`, and give it the next slot ahead of everything.
