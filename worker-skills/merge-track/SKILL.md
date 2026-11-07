---
name: merge-track
description: Hold the one credential that can move a feature track's integration branch, and fast-forward that branch to a ready PR's head when the manager asks. Nothing else — no other ref, no merge into the default branch, no code. Use when the manager starts a box with /merge-track.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: none
  argument-hint: "<owner/repo> <branch>   (e.g. discobox-ai/discobox feature/desktop-console)"
---

# Merge into a feature track

This box does **one thing** (owner, 2026-11-07): it moves one feature track's
branch (`manager.yaml` `tracks`, `merge: manager`) forward to a PR the
manager says is ready. It is the only holder of that power, so the manager's
own credential stays read-mostly. It is long-lived: it asks once, then waits
for the manager's requests. Read the `worker` skill for tags and power; this
job has no issue and no branch of its own.

## 1. Ask for the credential, once

`REPO` and `BRANCH` come from the prompt. Exactly these routes, for 30 days:

```sh
discobox-access request -name github-track -env-var GH_TOKEN -ttl 720h \
  -route "PATCH api.github.com/repos/$REPO/git/refs/heads/$BRANCH" \
  -route "GET api.github.com/repos/$REPO/**" \
  -justification "Fast-forward $BRANCH in $REPO to PRs the manager has checked are ready (feature track, owner 2026-11-07). That ref only; never force; never the default branch." \
  -wait -timeout 24h
```

No `-hosts` flag (it asks for the whole host). The `PATCH` route names that
one ref: GitHub's merge endpoints can't be limited to a base branch, so they
are never asked for. Tag the box `needs-input` while it waits; denied: tag
`blocked`, say so, stop. When it lapses, ask again the same way.

## 2. Each request

The manager types: `Merge PR #<P> at <sha>`. Before moving anything, check it
yourself (read-only, with the credential):

- `GET /repos/$REPO/pulls/<P>`: open, `base.ref` is `$BRANCH`, `head.sha` is
  `<sha>` (the PR didn't move since the manager looked);
- `GET /repos/$REPO/compare/$BRANCH...<sha>`: `status` is `ahead` (a
  fast-forward: `behind_by` 0);
- `GET /repos/$REPO/commits/<sha>/check-runs`: every run completed with
  `success`, `skipped` or `neutral` (none at all is allowed only while the
  track has no CI of its own; say so).

Any check fails: answer one line saying which, and move nothing. Otherwise:

```sh
eval "$(discobox-access env)"
curl -sSf -X PATCH -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/git/refs/heads/$BRANCH" \
  -d "$(jq -n --arg s "<sha>" '{sha:$s, force:false}')" | jq -r .object.sha
```

Confirm the ref is at `<sha>` and answer one line: `Merged #<P>: $BRANCH at
<sha>`. Never `force:true`, never another ref, never anything the manager
didn't ask for. Between requests, stay idle at the prompt (don't sleep the box:
the manager types into it).
