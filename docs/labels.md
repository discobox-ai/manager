# Labels

Every open issue in a watched repository has exactly one `status/*` label (or
none, which means new). The other groups describe it.

## status/* — where it is

| Label | Means | Set by |
|---|---|---|
| (none) | New; triage starts | – |
| `status/triaged` | Scoped and labelled, waiting for priority or a slot | triage worker's verdict, applied by the manager |
| `status/needs-decision` | The owner has to decide something before work starts; the issue says what | manager |
| `status/needs-input` | Its worker is waiting on the owner in the box (a question on its screen) | manager, from the box's `needs-input` tag or its screen |
| `status/ready` | Go: the next free worker takes it | owner, or the manager per `gates.md` |
| `status/in-progress` | A box of ours is working on it: launched, tagged `issue=N`, and named on the issue ("**In progress:** … discobox:///<id>") | manager, only through `scripts/launch` |
| `status/in-review` | Its PR is green, waiting for the owner. On a PR: ready for the owner's review now, the one label the owner looks for: out of draft, every check green, no merge conflict, and a Process check for its head, or, for an ADR PR, no Process check needed (owner, 2026-11-18). Kept by `scripts/pr-review-labels --apply` | manager |
| `status/blocked` | Waiting on something specific that isn't done: another issue or PR (linked), an owner action, an outside fix. A comment says what | manager or worker |
| `status/waiting-external` | Waiting on someone outside the project: a reporter's details, a vendor, an upstream fix. A comment names who and what. A reply from them takes it off and back to triage; 30 days with none closes the issue as not planned (owner, 2026-11-24). Kept by `scripts/waiting-external --apply` | manager, when triage's `Next` is "needs … from the reporter" or the owner says so |
| `status/paused` | Parked on purpose: nothing wrong, just not now (its milestone isn't being worked, the owner deferred it). A comment says why and what resumes it | manager |

**In progress means a box, always** (owner, 2026-11-16: "when we out assign
the 'in-progress' that we only do that if a box was actually launched and we
should put the associated box"). `scripts/launch` sets it, and only after
the box exists, with a comment naming the box. Never set it by hand: not when
a decision unblocks an issue, not when you reopen one, not while you mean to
start a worker soon. That's `status/ready` until the box is up. When the box
is retired or archived without the issue done, the label goes back to what
the issue now is (`ready`, `blocked`, `paused`, `in-review` if its PR is
green), in the same step. A worker that takes over a box (`submit`,
adoption, a platform worker's job) gets the same comment naming where the
work is happening. `scripts/stale-in-progress` lists any in-progress issue
with no live box of ours; run it on every heartbeat (`watch`).

**A blocked or paused label never stands alone** (owner, 2026-11-09): when you
set either one, post a comment in the same step that says what it waits on,
with a link (`Blocked on discobox-ai/discobox#865` / `Paused: v0.20 work; the
owner is working v0.19.x only (2026-11-07). Resumes when v0.20 starts.`). When
the reason changes, comment again; when it clears, swap the label and say so.
An issue or PR that waits on another one also links it in its body where the
template has room (`Depends on #N`).

## type/*

`type/bug`, `type/feature`, `type/adr` (the issue is the decision itself),
`type/flake`, `type/chore`.

## Kept from today

`area/*` (component), `platform/*` (macos, windows), `priority/low|medium|high|critical`.
`priority/*` is how the owner steers.

## Next up (owner, 2026-11-04)

What starts next, and how the table ranks, in four groups, each by
`priority/*` within it:

1. **Blockers:** `type/flake`, release-validation findings, anything that
   breaks CI, and anything blocking an issue in the release milestone.
2. **The release milestone** (`release.milestone` in `manager.yaml`, in
   `release.repo`): its issues, and the parts in other repositories
   `release.alsoIn` lists.
3. **The next release** (`release.next`): what the owner has decided to
   deliver, but after this release.
4. **Everything else already triaged**, including background streams the
   owner keeps out of the release (disco-vm drivers).

**The untriaged backlog waits** (owner, 2026-11-04): open issues that were
never triaged (no `status/*` label, filed before today) are triaged only
when a slot is free with nothing in groups 1-4 ready to start. A newly
filed issue is still triaged when it arrives (`triage-intake`).

What goes in `release.next`: an issue already triaged with a `priority/*`,
outside the current release, not a background stream, not waiting on an
owner decision. The manager moves those there itself and tells the owner.

A release is a GitHub milestone, created by the owner (the bot has Triage
and can only apply one). Its title says enough; it needs no description
(owner, 2026-11-04). A milestone can't hold another repository's issues, so
the release's parts elsewhere are listed in `manager.yaml`'s
`release.alsoIn`. Don't ask for milestones in other repositories: the owner
wants one place to look (owner, 2026-11-05). From v0.20 a release is a GitHub
Project across repositories (discobox#693); until then, work deferred to the
next release in another repository gets a comment saying so.

## Initiatives

A multi-issue effort (like discobox#42, disco-vm) is a tracking issue, not a
milestone (owner, 2026-11-01): one issue can span repositories, and its
comments carry the direction the owner sets. Its body lists the effort's
issues (as a task list, so GitHub shows progress) and links its ADRs; a
direction change is a comment on it. Each issue in the effort says
`Part of <repo>#<N>`.

## Linkage

- A box's tags are defined in the `worker` worker skill: `repo=<owner>/<name>`,
  `issue=<N>` and `job=<triage|adr|deliver|fix|rebase|adhoc|prototype>` set by the
  manager at launch (an ad-hoc or prototype box gets its `issue` from `submit`); `pr=<P>`
  and one state tag (`needs-input`, `blocked`, `ready`) set by the
  box. Retired boxes are archived (`discobox rm`), not tagged.
- An implementation PR says `Closes #N`; an ADR PR says `Part of #N`.
- Issues are written as `## Today` / `## Wanted` / `## Done when`, citing files
  and ADRs, so a worker can start from the issue alone.

## Migration

A repository is **migrated** once it has every `status/*` and `type/*` label
above. Until then the manager starts no triage in it (`gates.md`); a
`migrate-labels` worker plans the migration, the owner approves the plan in
its box, and it applies it.

The mapping from today's labels is in the `migrate-labels` worker skill, which
applies it (a worker can't read this repository, so the skill carries it).
