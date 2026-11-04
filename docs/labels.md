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
| `status/in-progress` | A worker is on it (its box is tagged `issue=N`) | manager |
| `status/in-review` | Its PR is green, waiting for the owner | manager |
| `status/blocked` | Waiting on another issue, named in a comment | manager or worker |

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
the release's parts elsewhere are listed in `manager.yaml`.

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
