---
name: cut-release
description: Cut one release tag — ask the owner for a credential that can create tags in the repository, create the annotated tag on the commit named in the prompt, and stop. Nothing else: no build, no watching, no validation, no other GitHub write. Use when the manager starts a box with /cut-release.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: none
  argument-hint: "<owner/repo> <tag> <commit sha>   (e.g. discobox-ai/discobox v0.19.0-rc.4 3e05cef1…)"
---

# Cut a release tag

This box does **one thing**: it creates one annotated tag, named in its
prompt, on the commit named in its prompt (owner, 2026-11-05). Pushing a
`v*` tag starts the repository's Release workflow; the manager watches that
and starts validation. You don't.

The box starts empty (`--no-source`) and is bound **no** credential. The bot
can't create tags (it has Triage), so you ask the owner for theirs, scoped to
creating this tag, and the owner approves it. Read the `worker` skill for the
tags and power; this job has no issue, PR or branch.

## 1. Check, before asking

`REPO`, `TAG` and `SHA` come from the prompt. Read without a credential (the
repository is public; `curl` to `api.github.com` with no token):

- `TAG` matches `v<major>.<minor>.<patch>` or `v<major>.<minor>.<patch>-rc.<n>`.
- `GET /repos/$REPO/git/ref/tags/$TAG` is 404: the tag doesn't exist yet.
- `GET /repos/$REPO/commits/$SHA` exists, and is on the default branch
  (`GET /repos/$REPO/compare/$SHA...<default branch>` has `status` `ahead`
  or `identical`).
- That commit's CI is green: `GET /repos/$REPO/commits/$SHA/check-runs`, every
  run `completed` with `success`, `skipped` or `neutral`.

Any check fails: tag `blocked`, write one line on the screen saying which and
why, and stop. Don't pick another commit or name.

## 2. Ask for the credential

Exactly these routes, for this repository, for an hour:

```sh
discobox-access request -name github -env-var GH_TOKEN -ttl 1h \
  -hosts api.github.com \
  -route "POST api.github.com/repos/$REPO/git/tags" \
  -route "POST api.github.com/repos/$REPO/git/refs" \
  -route "GET api.github.com/repos/$REPO/git/**" \
  -justification "Create the annotated release tag $TAG on $SHA in $REPO, which starts its Release workflow. Nothing else." \
  -wait -timeout 24h
```

Tag the box `needs-input` while it waits (`worker`); the manager puts
"Approve the tag credential" on the owner's table. Never ask for more routes,
never a git push route, and never use the credential for anything but §3.
Denied: tag `blocked`, say so, stop.

## 3. Create the tag

```sh
eval "$(discobox-access env)"
OBJ=$(curl -sSf -X POST -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/git/tags" \
  -d "$(jq -n --arg t "$TAG" --arg s "$SHA" '{tag:$t, message:$t, object:$s, type:"commit"}')" | jq -r .sha)
curl -sSf -X POST -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/$REPO/git/refs" \
  -d "$(jq -n --arg r "refs/tags/$TAG" --arg s "$OBJ" '{ref:$r, sha:$s}')" | jq -r .ref
```

Then check `GET /repos/$REPO/git/ref/tags/$TAG` points at a `tag` object
whose `object.sha` is `SHA`. Name the box `cut-release: $TAG`, write one line
on the screen (`Tagged $TAG on $SHA`), tag `ready`, and power off (`worker`,
Power).

## Done when

The tag exists on `SHA`, nothing else was written, and the box is tagged
`ready`.
