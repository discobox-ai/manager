# Worker skills

Every worker discobox gets these, installed by the manager with
`discobox run --skills /workspace/manager/worker-skills`, copied from the manager's checkout of the pushed `main`. A worker does one
job and ends in a defined state. The manager reads that state; nobody has to
read the worker's terminal to know where it stands.

## The contract every job keeps

It's the `worker` skill, which every job skill reads first: which repository
and issue the box is on (from its tags), the tags that say where it stands,
asking the owner (`AskUserQuestion`, after tagging `needs-input`), its GitHub
access, and keeping the box up. Nothing in these skills names a repository:
how a repository builds, tests, runs and reviews is in its own `AGENTS.md`
and skills (`verify-recipes`; `discobox-review` is in every box).

- **One job per box**, named in its prompt. A box never takes a second issue.
- **Work comes home as a PR** from `discobox/issue-<N>` on the bot's fork, never a push to a
  default branch.
- **The issue is the brief.** Thin means it should have been triaged first:
  say so and stop rather than guessing.
- **A job skill names its role** in its frontmatter, `metadata.discobox.role`.
  The manager binds that role at launch. When a skill starts making a call
  its role doesn't allow, change the role file (or the skill's role) in the
  same commit.

## Jobs

| Job | Skill | Ends when |
|---|---|---|
| Triage | `triage-issue` | A triage comment proposing labels and size, and a verdict; tagged `ready` |
| ADR | `propose-adr` | A Proposed ADR in its own PR, green; tagged `ready` |
| Deliver | `deliver-issue` | Its PR green; tagged `ready` and asleep, woken only when the PR needs it. Retired by the manager on merge |
| Fix CI | `fix-ci` | The fix is a PR, green; tagged `ready` |
| Rebase | `rebase-pr` | The PR rebased keeping both sides, green; tagged `ready` |
| Labels | `migrate-labels` | The repository has the `status/*` and `type/*` labels and every open issue is relabelled, after the owner approved the plan in the box; tagged `ready` |
| Tag | `cut-release` | One annotated tag on the commit in its prompt, with a credential the owner approved for that alone; tagged `ready` and powered off |
| Process check | `pr-check` | Long-lived, one per repository: posts the Process check (or what's missing) on each bot PR once it's green with no conflict; never merges or labels |
| Merge score | `merge-score` | Long-lived, one per repository: scores each in-review PR the merge gate refused (0–100 confidence it can merge as is, with the concern: complexity or risk), backfilling those already open; never merges or labels |
| Norm | `norm` | Long-lived: each hour, three draft tweets in Norm's voice from the manager's snapshot of the factory's hour; never posts anything |
| Merge | `merge-track` | Long-lived: holds the owner-approved credential for one feature track's branch ref, and fast-forwards it to a ready PR when the manager asks; nothing else |
| Prototype | `prototype` | The owner has seen the idea working (or not), with `~/prototype.md` listing what was decided and every shortcut; then submitted or dropped |
| Submit | `submit` | An ad-hoc or prototype box's work is an issue with a submit comment, then carried on as `deliver-issue`, parked on a pushed branch, or kept as design only |

`worker`, `commit`, `open-pr` and `verify` are the building blocks those jobs
use.
