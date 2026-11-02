# Worker skills

Every worker discobox gets these, installed by the manager with
`discobox run --skills discobox-ai/manager//worker-skills`. A worker does one
job and ends in a defined state. The manager reads that state; nobody has to
read the worker's terminal to know where it stands.

## The contract every job keeps

- **One job per box**, named in its prompt: triage, ADR, deliver, fix, rebase.
  A box never takes a second issue. An ad-hoc box (`job=adhoc`) has no job
  until the owner says "submit"; `submit` gives it one issue.
- **Work comes home as a PR** from `discobox/issue-<N>` (or a named branch for
  an ADR), never a push to a default branch.
- **The issue is the brief.** Read it first. If it is thin, the manager should
  have triaged it first. Say so and stop rather than guessing.
- **End by tagging your own box** (`~/.discobox/meta.json` tags, or
  `discobox tag` when available) with exactly one of:
  - `ready`: done; the PR (or the verdict comment) is in place and green;
  - `blocked`: can't proceed; the reason is a comment on the issue or PR;
  - `needs-input`: a decision only the owner can make. The question is open
    in your terminal, and summarized in a comment on the issue.
- **You start with what you need.** GitHub is bound at launch from your
  job's role (`roles/` in discobox-ai/manager), so don't ask for it up front.
  If you hit a one-off the role doesn't cover, ask for just that route with
  `discobox-access request` and say why; the owner decides.
- **Keep disk in check.** One Docker build at a time, `docker builder prune -a -f`
  when done building, no dev image watcher you don't need.

## Jobs

| Job | Skill | Ends when |
|---|---|---|
| Triage | `triage-issue` | A verdict comment on the issue: type, area, priority, ADR needed or not, and whether it needs the owner |
| ADR | `propose-adr` | A Proposed ADR in its own PR, green. No implementation |
| Deliver | `deliver-issue` | The implementation PR is green and mergeable. Stays to answer review until merged |
| Fix CI | `fix-ci` | The fix is a PR, green (or the PR it fixes is green again) |
| Submit | `submit` | An ad-hoc box's work is an issue with a submit comment, and then either carried on as `deliver-issue`, parked on a pushed branch, or kept as design only |
| Rebase | `rebase-pr` | The PR is rebased on its base, conflicts resolved keeping both sides, green |

`commit`, `open-pr`, `verify` and `test-fix` are the building blocks those
jobs use. They also rely on `discobox-review`, which every box has; workers
can assume it is there.

## Provenance

`deliver-issue`, `triage-issue`, `commit`, `open-pr`, `verify` and `test-fix`
were copied from discobox-ai/skills at 5676735 (2026-11-01); `develop` was
copied too and removed on 2026-11-02, superseded by `submit`. They
still assume the old process in places: plain `triaged` and `needs-decision`
labels, `orchestrate-issues` as the lead, AskUserQuestion for design choices.
Adapting them to this contract and `docs/labels.md` is open work; see
`docs/HANDOFF.md`.
