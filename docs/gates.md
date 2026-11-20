# Gates: what the manager does alone, and what goes to the owner

The manager acts alone on everything mechanical and reversible. Anything that
sets direction, trust or what ships goes to the owner, as a row on the table.

| Event | The manager does alone | Goes to the owner |
|---|---|---|
| The owner asks for a box to work in | Starts an ad-hoc box (`workers`, Ad-hoc boxes), within capacity | – |
| The owner wants to prototype something | Starts a prototype box (`workers`, Prototype boxes), within capacity | – |
| A prototype is dropped | Retires the box, files nothing | – |
| A PR into a feature track's branch is ready (`tracks`, `merge: manager`) | Fast-forwards the track's branch to it, closes its issue, ticks the epic, retires the box (`workers`, Feature tracks) | The track's branch into main |
| A stable release is tagged | Files the site import and publish issues and starts their workers (`workers`, Release docs) | Merging the import PR into `preview` and the `preview` → `main` PR that publishes discobox.ai |
| The owner says "take over PR N" (a trusted author's PR) | Back-fills its issue, comments on the PR, launches a `deliver-issue` worker to carry its commits through review and verify, and closes the old PR once the bot's PR is open (`workers`, Taking over a PR) | The milestone, if the owner didn't say; merging the new PR |
| The owner says "submit box X" | Types `/submit` into it once it's idle | Its questions, answered in the box |
| A submit comment lands on an issue (`submit` §5) | Applies its proposed labels and a status: *carry-on* → `status/in-progress`, the box becomes its worker; *waiting-on-adr* → `status/blocked`, the box is kept (powered off) and woken to carry on as `deliver-issue` when the owner merges its ADR PR; *parked* → `status/ready`, or `status/blocked` on a Proposed ADR, and the box is retired; *design-only* → `status/ready`, the box is retired. The owner's own work skips triage and the priority gate | Its ADR PR: read it there, merge it (accepting it) or reject it |
| A community PR (author not an owner, member or collaborator) with no issue it closes or is part of | Never merged, never checked out or run, its CI never approved (owner, 2026-11-04). Asks the owner whether to back-populate an issue from it. Yes: reads only its description, files the issue from that (not from its code), and closes the PR pointing to the issue. No, or no answer: comments that every PR must be linked to an issue, and closes it (`github` skill, Closing) | Whether the change it proposes is worth an issue |
| A community PR that names an issue | Never merged; nothing is read from it until the issue's own PR is done (`deliver-issue` §0). The issue goes through triage and delivery as usual. If the issue is rejected (closed not planned), closes the PR too, with a comment saying why | – |
| Our PR opens for an issue a community PR also names | Comments on the community PR naming ours as its replacement, and closes it (`github` skill, Closing) | – |
| A maintainer's PR with no issue | – | A "needs an issue" row. Don't file one for someone else's PR |
| A watched repository isn't migrated (lacks the `status/*` and `type/*` labels, `labels.md`) | Starts no triage in it. Starts a `migrate-labels` worker for it | The plan, approved in the worker's box |
| New issue, no `status/*` label, in a migrated repository | Starts a triage worker (`triage-issue`), at most `workers.triageMax` at once: a reported flake (a test that fails intermittently) first, then issues in the release milestone, then highest `priority/*`, then newest. An issue the manager files for a flake it saw in CI, or a worker files titled `Flaky: `, skips triage: `type/flake`, `priority/high`, `status/ready` | – |
| An issue is `status/in-progress` but no box of yours holds it | Starts no worker for it: someone else's worker has it. A row "worker not mine" | Only if it stays that way with nothing moving |
| Triage verdict | Applies the labels the verdict proposes, and sends it to `status/ready` **whatever its priority** when the fix is clear (owner, 2026-11-20: high and critical had been gated, so the most urgent work waited longest; #1400). A `type/flake` is always at least `priority/high`. A non-obvious design still gets an ADR first, when a worker picks it up. **High or critical: a heads-up, not a gate** (below) | Only a real decision becomes `status/needs-decision`: whether to do it at all, which of competing approaches, product direction, or a security advisory. The issue says what to decide |
| The owner says to cut a release | Starts a `cut-release` box for the tag on the default branch's green head (`workers`, Cutting a release); retires it when it's `ready`. When the prerelease is published, starts the two `validate-release` boxes | Approves the tag box's credential request (never the manager) |
| An issue found by release validation (`validate-release`) | Files it `priority/high`, `status/ready` (owner, 2026-11-04: release-validation findings always come first); no owner gate | – |
| `status/ready` and a free slot | Takes the next up (`docs/labels.md`, Next up): blockers first (`type/flake`, release-validation findings, anything that breaks CI or blocks a milestone issue), then issues in the release milestone, then the rest, each by `priority/*`. Starts a worker: `propose-adr` if the design is non-obvious and no accepted ADR covers it, else `deliver-issue`. Sets `status/in-progress` | – |
| An ADR PR is green, with no conflict | Sets `status/in-review` (`scripts/pr-review-labels --apply`; no Process check) | Review and merge (merging is accepting), or reject with a comment |
| An ADR PR merges | Retires its `propose-adr` worker. Sets the issue `status/ready` and, with a free slot, starts a `deliver-issue` worker, which marks the ADR Accepted and implements it in one PR | – |
| An implementation PR is green, with no conflict | In discobox and vm, nothing: its repository's `pr-check` box reads its Evidence and posts the process comment (or a "missing" one). On its Process check, sets `status/in-review` (`scripts/pr-review-labels --apply`); on "missing", wakes the worker with what's missing. Elsewhere, does the check itself (`github` skill, The process comment) | Review and merge, after the comment |
| The merge gate refuses an in-review PR | Nothing: its repository's `merge-score` box scores it (0–100 confidence it can merge as is, and the concern). On its Merge score comment, adds the score to the row's `doing` (`workers`, The merge-score boxes) | Review and merge, with the score to go on |
| A PR conflicts with its base | If it's at "Review and merge" (or green and on its way there): wakes its worker to rebase at once, whatever its rank. The owner merges in any order (owner, 2026-11-05: four conflicts caught by the owner in a day under the old top-3 rule) (`workers`, Rebases) | – |
| A PR's CI fails and its worker is stopped | Starts the worker again on `fix-ci` | "Look at it" if the worker says it can't make it green |
| Main's CI fails | If it looks like a flake (unrelated to the commit), files a `type/flake` issue (`priority/high`, `status/ready`); the manager can't re-run CI (the bot has Triage). Otherwise files an issue and starts a `fix-ci` worker | – |
| A PR merges | Closes its issue if it's still open, and retires its worker as it sleeps: archived with `discobox rm`, never woken to do anything | – |
| A worker asks for a credential | Approves it when it's appropriate for the box's job: what its launch would have bound, such as an adopted box asking for its job's role (`adopt`) | Anything wider: another repository, merge, labels, a draft token, any other secret |
| The owner asks to adopt a box | Adopts it, writes its issue, tags it, gives it its role, briefs it (`adopt`) | Approving the adoption in the console |
| A worker stops on a question | Makes sure the box is tagged `needs-input` and its issue is `status/needs-input`, setting them if the box didn't (`workers`, A question without its tag) | "Answer in the box"; the owner answers in the box |
| A worker shows a mechanical prompt (login expired, the first-run permission dialog) | Answers it (see `workers`) | – |
| Disk below `disk.minFreeGiB` | Starts no workers; has idle workers free their build caches | Only if it can't recover |
| A worker waiting on the owner, its screen still for `workers.pauseAfter` | Stops it (`workers`, Power) | "Answer in the box"; opening it starts it |
| An event for a sleeping worker's PR or ADR (review, comment, failing check, a rebase it's due) | Starts it and types one line saying why. Not for a merge | – |
| A finished worker | Archives it (`discobox rm`) | – |

Rank table rows by how much each unblocks downstream (critical path first), then
by how hard the decision is to reverse (trust roots and stored credentials rank
high).


## Heads-up on a high or critical triage (owner, 2026-11-20)

High and critical issues go straight to `ready` and start first. The owner
still sees the rating, so a triage box can't quietly push its own issue to
the front:

- **The table:** a row for 24 hours, Doing `triaged <priority>, started`,
  Your move `Check the rating (optional)`. Clear it after 24 hours or once
  the owner says anything about it. It never blocks the worker.
- **Critical only:** `manager-chat` also says it in chat, in one line, with
  the title, why it's critical, and that work has started.
- **The owner disagrees:** set the priority they say, and the issue drops to
  its new place in the queue. If its worker hasn't pushed yet and it's now
  medium or below, leave the worker on it.
