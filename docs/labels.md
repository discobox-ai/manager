# Labels

Every open issue in a watched repository has exactly one `status/*` label (or
none, which means new). The other groups describe it.

## status/* — where it is

| Label | Means | Set by |
|---|---|---|
| (none) | New; triage starts | – |
| `status/triaged` | Scoped and labelled, waiting for priority or a slot | triage worker's verdict, applied by the manager |
| `status/needs-decision` | The owner has to decide something; the issue says what | manager |
| `status/ready` | Go: the next free worker takes it | owner, or the manager per `gates.md` |
| `status/in-progress` | A worker is on it (its box is tagged `issue=N`) | manager |
| `status/in-review` | Its PR is green, waiting for the owner | manager |
| `status/blocked` | Waiting on another issue, named in a comment | manager or worker |

## type/*

`type/bug`, `type/feature`, `type/adr` (the issue is the decision itself),
`type/flake`, `type/chore`.

## Kept from today

`area/*` (component), `platform/*` (macos, windows), `priority/low|medium|high|critical`.
`priority/*` is how the owner steers. `triaged` and `needs-decision`, the
labels in use today, map to `status/triaged` and `status/needs-decision` in
the migration.

## Initiatives

A multi-issue effort (like discobox#42, disco-vm) is a tracking issue, not a
milestone (owner, 2026-11-01): one issue can span repositories, and its
comments carry the direction the owner sets. Its body lists the effort's
issues (as a task list, so GitHub shows progress) and links its ADRs; a
direction change is a comment on it. Each issue in the effort says
`Part of <repo>#<N>`.

## Linkage

- A worker box is tagged `issue=<repo>#<N>` and `job=<triage|adr|deliver|fix|rebase>`.
  An ad-hoc box is tagged `repo=<repo>` and `job=adhoc` until `submit` gives it
  an `issue`.
- An implementation PR says `Closes #N`; an ADR PR says `Part of #N`.
- Issues are written as `## Today` / `## Wanted` / `## Done when`, citing files
  and ADRs, so a worker can start from the issue alone.

## Migration (not done yet)

Create the labels in each watched repository and relabel open issues. This is
a job for a worker; see `docs/HANDOFF.md`.
