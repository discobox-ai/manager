---
name: migrate-labels
description: Move one repository onto the manager's label scheme — create the status/* and type/* labels, map each open issue's old labels to new ones, show the owner the plan, and apply it once approved. Use when a worker box is launched to migrate a repository's labels.
allowed-tools: Bash, Read, Glob, Grep, Write, AskUserQuestion
metadata:
  discobox.role: github-labels
---

# Migrate a repository's labels

**Read the `worker` skill first** (`REPO`, tags, asking the owner, GitHub).
There's no `issue` tag: the job is the whole repository.

## The scheme

Every open issue ends with at most one `status/*` (none means new, to be
triaged) and one `type/*`:

| Label | Description |
|---|---|
| `status/triaged` | Scoped and labelled, waiting for priority or a slot |
| `status/needs-decision` | The owner has to decide something before work starts |
| `status/needs-input` | Its worker is waiting on the owner in the box |
| `status/ready` | Go: the next free worker takes it |
| `status/in-progress` | A worker is on it |
| `status/in-review` | Its PR is green, waiting for the owner |
| `status/blocked` | Waiting on something named in a comment |
| `status/paused` | Parked on purpose, not now; a comment says why |
| `type/bug` | Behaviour is wrong |
| `type/feature` | New behaviour |
| `type/chore` | Cleanup, docs, build, no behaviour change |
| `type/flake` | A test fails intermittently |
| `type/adr` | The issue is a design decision |

## The mapping

Each open issue's old labels map to new ones:

| Old label | New label |
|---|---|
| `in-progress` | `status/in-progress` |
| `needs-decision` | `status/needs-decision` |
| `needs-info` | `status/blocked` (waiting on the reporter; the comment says so) |
| `triaged` (and none of the above) | `status/triaged` |
| none of the above | no `status/*`: new, triaged later |
| `bug` | `type/bug` |
| `enhancement` | `type/feature` |
| `flaky` | `type/flake` |
| `documentation` | `type/chore` |

When an issue carries more than one old status label, the first row in the
table that matches wins. `area/*`, `platform/*` and `priority/*` stay as they
are. The mapped old labels come off each issue; the old label definitions
themselves stay in the repository until the owner says to delete them.
`duplicate`, `wontfix`, `good first issue`, `help wanted` and `invalid` are
left alone.

Pull requests aren't relabelled.

Invoking this skill is authorization to create and edit labels in `REPO`,
and to add and remove labels on its open issues, **after the owner approves
the plan**. It isn't authorization to delete a label definition, close or
edit an issue, or touch pull requests.

## 1. Read

```bash
gh api "repos/$REPO/labels?per_page=100" --paginate --jq '.[] | [.name, .color, .description] | @tsv'
gh api "repos/$REPO/issues?state=open&per_page=100" --paginate \
  --jq '.[] | select(.pull_request | not) | [.number, ([.labels[].name] | join(","))] | @tsv'
```

## 2. Plan

Write the plan to `<scratchpad>/label-plan.md`:

- **Labels to create:** every label in The scheme the repository lacks,
  with its description from that table, and one color per group (`status/*` all one color, `type/*`
  another). A label that exists already is left as it is.
- **Per issue:** its number, the labels it gains, and the labels it loses,
  by the mapping table. One line per issue that changes, grouped by the
  `status/*` it ends with, and a count per group.
- **Issues left new:** the ones that end with no `status/*` (they'll be
  triaged); count them.
- **Anything the table doesn't decide** (an old label not in it, a
  conflicting pair): listed, and left alone unless the owner says otherwise.

## 3. Ask

Tag `needs-input`, show the plan's summary (the counts, the labels to
create, and anything undecided), give the plan's path, and ask with
`AskUserQuestion`: "Apply this plan", "Change it" (they say how), "Stop".
Drop the tag once answered. On a change, revise the plan and ask again.

## 4. Apply

1. Create the missing labels: `gh api -X POST repos/$REPO/labels -f name=…
   -f color=… -f description=…`.
   A 404 means the bot can't create labels there (it has Triage; that needs
   Write). Don't ask for a credential: tag the box `needs-input` and ask the
   owner to run `./scripts/create-labels $REPO` from a checkout of
   discobox-ai/manager, then carry on from step 2 once the labels exist.
2. For each issue in the plan, add its new labels (`gh api -X POST
   repos/$REPO/issues/<n>/labels -f 'labels[]=status/triaged' …`), then
   remove its mapped old ones (`gh api -X DELETE
   repos/$REPO/issues/<n>/labels/<name>`, the name URL-encoded:
   `status%2Ftriaged`). Add before removing, so an issue is never left
   without its status.
3. For an issue mapped to `status/blocked` from `needs-info`, comment once:
   "Waiting on the reporter (was `needs-info`)." with the `worker` footer.
4. Re-read the issues (§1) and check every one matches the plan.

## Done when

The repository has every `status/*` and `type/*` label, every open issue
carries what the plan says, and the box is tagged `ready`. Finish with the
counts per `status/*`, the labels created, and anything left undecided.
