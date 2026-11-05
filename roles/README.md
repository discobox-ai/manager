# Roles

Each file here is a discobox **credential policy** (ADR 26-10-30-584 in
discobox-ai/discobox; schema `cli/credential-policy.schema.json`): the GitHub
routes one kind of box may use, with `owner` and `repo` filled in when it's
bound. The file name is the role's name. A worker is bound its role when the
manager launches it, so it never has to ask for GitHub, and nothing it does
can reach past the role.

A job skill names its role in its frontmatter, `metadata.discobox.role`,
and that's what the manager binds. The table below is a summary; the skills
are the source.

| Role | Bound to | Allows |
|---|---|---|
| `github-triage` | `triage-issue` workers | Read the repository and search issues; comment on issues; file issues |
| `github-deliver` | `deliver-issue`, `propose-adr`, `fix-ci`, `rebase-pr` workers, and ad-hoc and prototype boxes (`submit`; `github-submit` was the same routes and is gone, 2026-11-05) | Triage's, plus git push and fetch; open and edit its PR; reply to review; mark ready; file issues. No CI re-run: GitHub requires admin rights the bot doesn't have, so a worker re-runs by pushing again |
| `github-labels` | `migrate-labels` workers | Read; create and edit labels; set and remove labels on issues; comment (delegated for discobox-ai/manager only: elsewhere the bot has Triage, which can't create labels, so the owner creates them; owner, 2026-11-04) |
| (none) | `cut-release` boxes | Bound nothing: the box asks the owner for a credential that can create one tag (`POST git/tags`, `git/refs`), since the bot has Triage |
| `github-manager` | The manager itself, once per watched repository | Read; file, comment on, label and close issues; re-run failed CI. No git, no PRs |
| `github-push` | The manager itself, for discobox-ai/manager only | Git fetch and push |

No role allows a merge (there is no merge route), a workflow dispatch, or any
write to a repository other than the one it was bound for. What a route can't
narrow is said in the skills and held by branch protection: a git push can
name any branch, `PATCH …/pulls/*` can close a PR as well as edit it, and
GraphQL queries read every repository the token can see.

## Binding a worker at launch

From this repository's root (policy paths are read from the working
directory, and the server stores the resolved routes, not the file).
`$GH_SECRET` is the name of the GitHub secret the manager was delegated, read
from `discobox-access list -json` (`workers`, Launch): the owner chooses the
secret when approving, so it isn't always `github`.

```sh
discobox run -d --skills discobox-ai/manager//worker-skills \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/github-deliver.json,owner=discobox-ai,repo=discobox,forkOwner=ibuildthecloud-bot" \
  https://github.com/discobox-ai/discobox@main -p 'Deliver issue #432 in discobox-ai/discobox.'
```

A box the manager creates can be bound only what the manager was delegated,
so the manager's delegation (below) must cover every worker role in every
watched repository. Editing a file here changes no existing binding; it
reaches new boxes once it's pushed.

## The manager's own access

A box can give its workers only what it was delegated. The manager asks for
everything it needs in one request, `roles/manager-request.json`, sent from
this repository's root (ADR 26-11-02-022 in discobox-ai/discobox):

```sh
discobox-access request --json < roles/manager-request.json
```

- **Use part** (`policies`), in `GH_TOKEN`: `github-manager` for every
  repository in `manager.yaml`, and `github-push` for discobox-ai/manager.
- **Delegate part** (`delegate.policies`): every role a job skill names
  (`metadata.discobox.role`), for every repository in `manager.yaml`.
  Except `github-labels`, only where the bot has Write. A request names at
  most 32 policies across both parts.

**Always send the whole file, never a part of it** (owner, 2026-11-04):
until discobox#630 is fixed, an addition can't be granted forever, so the
owner approves every request as a replace, which needs the full set. Never
send a request for only the route or repository that's new.

The owner approves or denies each part on one screen. **An approved part
replaces the manager's binding of that kind**, so the file must always list
the whole access: a repository or role left out is access lost. Whenever a
repository is added to `manager.yaml`, or a skill's `discobox.role` changes,
update this file in the same commit and ask again.
