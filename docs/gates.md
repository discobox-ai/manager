# Gates: what the manager does alone, and what goes to the owner

The manager acts alone on everything mechanical and reversible. Anything that
sets direction, trust or what ships goes to the owner, as a row on the table.

| Event | The manager does alone | Goes to the owner |
|---|---|---|
| The owner asks for a box to work in | Starts an ad-hoc box (`workers`, Ad-hoc boxes), within capacity | – |
| The owner wants to prototype something | Starts a prototype box (`workers`, Prototype boxes), within capacity | – |
| A prototype is dropped | Retires the box, files nothing | – |
| The owner says "submit box X" | Types `/submit` into it once it's idle | Its questions, answered in the box |
| A submit comment lands on an issue (`submit` §5) | Applies its proposed labels and a status: *carry-on* → `status/in-progress`, the box becomes its worker; *parked* → `status/ready`, or `status/blocked` on a Proposed ADR, and the box is retired; *design-only* → `status/ready`, the box is retired. The owner's own work skips triage and the priority gate | A Proposed ADR it opened: accept or reject |
| A community PR (author not an owner, member or collaborator) with no issue it closes or is part of | Comments that every PR must be linked to an issue, and closes it (`github` skill, Closing) | – |
| A community PR that names an issue | Nothing to the PR itself: it's never merged, only a reference. The issue goes through triage and delivery as usual, and its worker reads the PR as reference (`deliver-issue` §0) | – |
| Our PR opens for an issue a community PR also names | Comments on the community PR, naming ours, and closes it (`github` skill, Closing) | – |
| A maintainer's PR with no issue | – | A "needs an issue" row. Don't file one for someone else's PR |
| A watched repository isn't migrated (lacks the `status/*` and `type/*` labels, `labels.md`) | Starts no triage in it. Starts a `migrate-labels` worker for it | The plan, approved in the worker's box |
| New issue, no `status/*` label, in a migrated repository | Starts a triage worker (`triage-issue`), at most `workers.triageMax` at once, highest `priority/*` first, then newest | – |
| An issue is `status/in-progress` but no box of yours holds it | Starts no worker for it: someone else's worker has it. A row "worker not mine" | Only if it stays that way with nothing moving |
| Triage verdict | Applies the labels the verdict proposes. Anything at `priority/medium` or below goes straight to `status/ready` (owner, 2026-11-01); a non-obvious design still gets an ADR first, when a worker picks it up | A choice of product direction (whether to do it at all, or which way), and anything at `priority/high` or `priority/critical`, become `status/needs-decision` |
| `status/ready` and a free slot | Starts a worker: `propose-adr` if the design is non-obvious and no accepted ADR covers it, else `deliver-issue`. Sets `status/in-progress` | – |
| An ADR PR is green | – | Accept or reject. Merging it is not acceptance; the owner says "accept", then a worker marks it Accepted in a PR of its own |
| An implementation PR is green | Reads its Evidence against the PR and the issue (`github` skill, The process comment). Something missing or not matching: sends the worker back to do it. Otherwise posts the process comment and sets `status/in-review` | Review and merge, after the comment |
| A PR conflicts with its base | Only if it's in the top 3 of the merge queue: wakes its worker to rebase. Further down, it waits its turn (`workers`, Rebases) | – |
| A PR's CI fails and its worker is stopped | Starts the worker again on `fix-ci` | "Look at it" if the worker says it can't make it green |
| Main's CI fails | Re-runs once if it looks like a flake (unrelated to the commit). Otherwise, or if it fails twice, files an issue and starts a `fix-ci` worker | – |
| A PR merges | Closes its issue if it's still open, and retires its worker as it sleeps: tagged `to-delete`, stopped, never woken to do anything | Listed for deletion |
| A worker asks for a credential | – | Every request: workers get GitHub from their role at launch (`roles/`), so a request is outside it |
| A worker stops on a question | Makes sure the box is tagged `needs-input` and its issue is `status/needs-input`, setting them if the box didn't (`workers`, A question without its tag) | "Answer in the box"; the owner answers in the box |
| A worker shows a mechanical prompt (login expired, the first-run permission dialog) | Answers it (see `workers`) | – |
| Disk below `disk.minFreeGiB` | Starts no workers; has idle workers free their build caches | Only if it can't recover |
| A worker waiting on the owner, its screen still for `workers.pauseAfter` | Stops it (`workers`, Power) | "Answer in the box"; opening it starts it |
| An event for a sleeping worker's PR or ADR (review, comment, failing check, a rebase it's due, "accept") | Starts it and types one line saying why. Not for a merge | – |
| A finished worker | Tags it `to-delete` and stops it | Listed for deletion |

Rank table rows by how much each unblocks downstream (critical path first), then
by how hard the decision is to reverse (trust roots and stored credentials rank
high).
