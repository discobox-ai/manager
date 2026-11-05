# 26-11-04-001: Package the review workflow and CLI with the worker skills

Status: Proposed

Date: 2026-11-04

Issue: [manager#1](https://github.com/discobox-ai/manager/issues/1)

## Context

The manager requires review to sign-off in `worker-skills/deliver-issue/SKILL.md`
and reports it in `worker-skills/open-pr/SKILL.md` and
`.agents/skills/github/SKILL.md`. `worker-skills/worker/SKILL.md` currently
assumes every box has `discobox-review`; prototype work explicitly skips it.
These references were checked at manager commit `b7c2f55`.

The installed review skill and `discobox-review --help` confirm a local CLI
over `.git/discobox-review.json`, with separate identities for reviewers,
authors and the user. The skill requires parallel fresh-eyes reviewers,
repository definitions in `.discobox/review/*.md`, repeated review until every
reviewer approves every file, and a final card written by a separate agent.
The tool also has an interactive window, which this workflow does not need.

Issue #1 identifies the upstream implementation in discobox-ai/review and its
provisioning in `sandbox-agent/features/review` and `sandbox-agent/Dockerfile`
in discobox-ai/discobox. This worker's role denies source reads in those two
repositories. Their implementation details and the cited ADRs 0125 and
26-10-23-614 have therefore **not** been independently inspected for this
proposal. Their source and compatibility contracts must be inspected by the
respective implementation workers before removing provisioning. This record
does not assert a replacement for either upstream ADR.

## Decision

### Ownership and invocation

Keep the skill name **discobox-review**, installed at
`worker-skills/discobox-review/SKILL.md`. Package its implementation beside it
as `review.mjs`, invoked as `node <installed-skill-directory>/review.mjs`.
The skill must explain how to locate its installed directory and use an
absolute script path in delegated briefs, independent of the caller's cwd.
Do not install a global executable or require a shell alias in subagents.

Use Node built-ins only, with Git invoked through argument arrays rather than
shell interpolation. Require Node 22 or later and Git; check prerequisites
and fail with an actionable message. Node's presence in today's image is an
issue assertion, not a permanent provisioning guarantee. Record the minimum
version in the skill and exercise it in tests. No npm install, Go binary,
network service or TUI is required to run a review.

Keep the existing workflow and its role boundaries. Preserve reviewer
definition snapshots, per-reviewer approval, invalidation after content
changes, the five-round limit, author replies without author resolution, and
the independent card author. Update process references to say explicitly
that the installed skill uses its bundled Node script; keeping the skill's
name must not leave any examples invoking the old binary.

### CLI compatibility boundary

Retain the complete command surface listed in issue #1 for the first port:

- `diff` with `--path`, `--stat`, `--raw`; `base` with a ref or `--auto`.
- `list` with `--path`, `--open`, `--resolved`; `show`.
- `comment`, `reply`, `resolve`, `reopen`, `delete`.
- `approve`, `unapprove`; `status`, including `--by` identity selection.
- `card` display, `set` from file or stdin, `clear`, `schema`, and `--json`.
- `-base`, `-fallback-base`, `-head` review selection and command help.

Some commands are recovery tools rather than steps in a successful round;
that alone is insufficient reason to remove them while changing runtimes.
Do not port the window, window flags, or terminal UI. With no subcommand,
print CLI help instead of opening a window. Any other intentional departure
discovered during implementation must be documented and reviewed explicitly.

Preserve the outputs consumed by the skill: line-oriented status keys,
stable conversation IDs, diff paths and line anchors, reviewer identities,
and card JSON. Capture fixtures with the pinned Go version before porting;
do not infer the data schema or semantics from help text alone. Tests must
also establish error exit behavior, ref selection, working-tree versus
explicit-head review, and handling of deleted and renamed paths.

### Persisted state and concurrent writers

Keep the existing JSON format, including existing comments, approvals and
cards. Locate it using Git's resolved repository metadata directory, so a
worktree whose `.git` is a file works too. Read Go-created state without
migration. Preserve fields the port does not own; reject unsupported or
malformed state without overwriting it. Never silently reset a review.

Concurrent reviewer processes must serialize the entire read-modify-write
transaction and publish complete state atomically. Use the existing lock
protocol if inspection confirms it can be implemented compatibly in Node.
If it cannot, mixed Go/Node **writes** are unsupported: require all writers
on a review to switch together, document the check before review starts,
and test concurrent Node writers. Old review files remain readable. Do not
claim two implementations can safely write together merely because their
JSON formats match. The exact lock mechanism is an implementation detail
to settle from source inspection, not an excuse to omit serialization.

### Rollout and removal

1. A manager implementation PR marks this ADR Accepted after its proposal PR
   merges, adds the skill, script, fixtures and tests, and updates worker
   instructions and the manager's process check. Run a complete delegated
   review with the old executable excluded from PATH and the skill installed
   through the normal worker-skills installer. Record evidence in that PR.
2. Keep old provisioning available until that PR merges and the installation
   experiment passes. Finish active reviews with their original writer or
   switch all participants together; existing boxes need not be modified.
3. A separate issue-linked discobox PR removes the provisioned review skill,
   binary link, `diff` tool and `REVIEW_VERSION` wiring identified by #1.
   Its worker must inspect all consumers, related ADRs and image build
   wiring, and demonstrate fresh boxes build and can run the new skill.
   A manager-only PR cannot satisfy this part of #1's completion criteria.

This proposal includes no replacement console diff viewer. Removing an
interactive product surface requires a decision in the discobox repository
after inspecting ADR 26-10-23-614; if that contract requires a viewer, gate
the removal PR on a separately proposed amendment or retain the tool until
that decision is accepted. Do not let the CLI port implicitly revoke it.
Likewise, leave discobox-ai/review unarchived. Repository archival is a
separate owner decision after consumers and compatibility fixtures are
accounted for. Neither open question blocks implementing the bundled CLI.

## Validation required for implementation

Use Node's built-in test runner against disposable Git repositories. Cover
every retained command and option, Go-produced state fixtures, approval
invalidation, comment lifecycle, identity isolation, card validation and
staleness, ref selection, worktrees, paths containing spaces, malformed
state, failed writes, and multiple simultaneous reviewer processes. Check
semantic state and consumed output against the pinned Go implementation;
normalize timestamps and temporary paths only where they are incidental.
Fixtures must record their producer version and provenance.

The installation experiment must reach zero open comments and zero
unapproved files for **each** reviewer, include a repository-defined reviewer
and a separately authored card, and demonstrate persistence across a new
process. Capture Node/Git versions and proof that the old executable was
unavailable. The discobox removal PR additionally supplies its image build
and fresh-box evidence. Missing upstream access is a reported blocker for
those checks, never a passing compatibility result.

## Alternatives and consequences

- Keeping the Go CLI preserves behavior cheaply, but retains the image pin
  and splits ownership of the workflow and its implementation.
- Renaming the skill to `review` shortens its name but adds migration churn
  and ambiguity with existing review instructions. Keeping its name lets
  Evidence and process checks remain recognizable.
- A global `discobox-review` Node shim would preserve command spelling but
  couples execution to image provisioning again. Explicit script paths
  make a skill installation sufficient.
- A new state schema or database could simplify the port but would strand
  active local reviews. Compatibility takes priority over redesign here.
- Porting only happy-path commands saves code initially but removes repair
  operations and makes parity harder to establish. Pruning can follow as
  a separately justified change.

The manager takes ownership of CLI correctness, concurrency and fixtures.
Workers gain a review implementation that travels with their skills, at the
cost of an explicit Node prerequisite and a maintained compatibility suite.
This ADR authorizes no implementation until the owner merges its PR; it
remains Proposed in this PR.
