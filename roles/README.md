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
| `github-triage` | `triage-issue` workers | Read the repository and search issues; comment on issues |
| `github-deliver` | `deliver-issue`, `propose-adr`, `fix-ci`, `rebase-pr` workers | Triage's, plus git push and fetch; open and edit its PR; reply to review; mark ready; re-run failed CI |
| `github-submit` | Ad-hoc boxes (`job=adhoc`), for `submit` | Deliver's, plus filing an issue |
| `github-manager` | The manager itself, once per watched repository | Read; file, comment on, label and close issues; re-run failed CI. No git, no PRs |
| `github-push` | The manager itself, for discobox-ai/manager only | Git fetch and push |

No role allows a merge (there is no merge route), a workflow dispatch, or any
write to a repository other than the one it was bound for. What a route can't
narrow is said in the skills and held by branch protection: a git push can
name any branch, `PATCH …/pulls/*` can close a PR as well as edit it, and
GraphQL queries read every repository the token can see.

## Binding a worker at launch

From this repository's root (policy paths are read from the working
directory, and the server stores the resolved routes, not the file):

```sh
discobox run -d --skills discobox-ai/manager//worker-skills \
  --bind 'github:GH_TOKEN,policy=roles/github-deliver.json,owner=discobox-ai,repo=discobox' \
  https://github.com/discobox-ai/discobox@main -p 'Deliver issue #432 in discobox-ai/discobox.'
```

A box the manager creates can be bound only what the manager was delegated,
so the manager's delegation (below) must cover every worker role in every
watched repository. Editing a file here changes no existing binding; it
reaches new boxes once it's pushed.

## Setting up the manager's box (the owner, once)

The manager needs two bindings of `github`: one it uses itself, and one it
delegates to its workers. `github-submit` covers `github-deliver` and
`github-triage`, so one policy per repository is the whole delegation. For
each repository in `manager.yaml`:

```sh
M=<manager box>
# Delegated to workers: submit ⊇ deliver ⊇ triage.
discobox secret bind github $M --delegate --for 1mo \
  --policy roles/github-submit.json --policy-arg owner=discobox-ai --policy-arg repo=discobox \
  --policy roles/github-submit.json --policy-arg owner=discobox-ai --policy-arg repo=vm \
  --policy roles/github-submit.json --policy-arg owner=discobox-ai --policy-arg repo=manager \
  --policy roles/github-submit.json --policy-arg owner=discobox-ai --policy-arg repo=review
# Used by the manager.
discobox secret bind github $M --as GH_TOKEN --for 1mo \
  --policy roles/github-manager.json --policy-arg owner=discobox-ai --policy-arg repo=discobox \
  --policy roles/github-manager.json --policy-arg owner=discobox-ai --policy-arg repo=vm \
  --policy roles/github-manager.json --policy-arg owner=discobox-ai --policy-arg repo=manager \
  --policy roles/github-manager.json --policy-arg owner=discobox-ai --policy-arg repo=review \
  --policy roles/github-push.json    --policy-arg owner=discobox-ai --policy-arg repo=manager
```

Not yet tried: whether one box can hold a delegate binding and a use binding
of the same secret side by side. If the server keeps one binding per secret,
merge them into a single `--delegate --as GH_TOKEN` binding with every policy
above. The manager could then also push to product repositories, which
AGENTS.md forbids, but no route would stop it.
