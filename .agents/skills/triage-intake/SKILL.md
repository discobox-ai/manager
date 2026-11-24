---
name: triage-intake
description: How the manager handles incoming work — a new issue, an issue the owner points at, or a request in conversation. Use when an issue appears with no status label, or the owner asks for something to be done.
---

# Intake

## A new issue in a watched repository (no `status/*` label)

0. **Only in a migrated repository** (it has the `status/*` and `type/*`
   labels, `docs/labels.md`). In one that isn't, every issue looks new: start
   no triage there, start a `migrate-labels` worker instead (`workers`). And
   only up to `workers.triageMax` triage workers at once, a flake
   first, then the release milestone's, then highest `priority/*`, then newest
   (`docs/labels.md`, Next up)
1. Start a triage worker:
   `-p 'Triage issue #N in <repo>.'` (job `triage`, skill `triage-issue`).
   **Adding the issue's row is not triaging it** (discobox#741 sat unlabeled
   with only a "Needs triage" row, 2026-11-06): launch the triage worker in
   the same step, before you handle the next event. If you can't (no slot,
   low disk), the row says why. An issue a worker filed with the bot account
   is new work like any other.
2. When it finishes, its verdict is a comment on the issue: proposed
   `type/*`, `area/*` and `priority/*`, a rewritten body if it was thin, and
   whether it needs an ADR or a decision.
3. Apply the verdict by `docs/gates.md`: `status/ready`, `status/triaged`
   or `status/needs-decision`, or `status/waiting-external` when its `Next`
   is "needs … from the reporter" (or another outside party: a vendor, an
   upstream fix), never `status/needs-input` or `status/blocked` for that.
   The issue must carry a comment that **@-mentions that party and asks
   them directly** ("@login, could you send …"); "the reporter needs to
   send …" isn't one (owner, 2026-11-24). If the verdict didn't, post it
   before labelling. `scripts/waiting-external` lists any labelled issue
   without one as `unasked`: post it then.
   When its `Next` is **duplicate of #M** (owner, 2026-11-24: "look for
   duplicates and associate and close one of them"): keep the one the
   verdict names, copy anything only the other has into a comment on the
   kept one ("From #K: …"), then close the other as a duplicate with
   `Duplicate of #M.` as its comment (GitHub links the two) and
   `state_reason=duplicate`. If the closed one had a box, retire it; if
   both had PRs, the kept one's PR goes on and the other is closed with a
   line naming it. Cross-repository: name it as `owner/repo#M`. A reporter
   on the closed one is @-mentioned in that comment, so they follow the
   kept issue.
   `scripts/waiting-external` takes it off when they reply and closes the
   issue after 30 days without (owner, 2026-11-24). Retire the triage box.

## The owner asks for something in conversation

- If it's a change to a product repository, **file an issue** (Today / Wanted /
  Done when), then treat it as `status/ready` (the owner asked): set the
  label and start the worker (an ADR worker if the issue needs one), by
  priority when slots are short. Don't wait for a milestone: asking for it is
  the go-ahead, and a missing milestone is only a question on the table
  (owner, 2026-11-06, on discobox#744). manager-chat files these and passes
  them on; the loop starts their workers. Don't make the change yourself.
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
