---
name: merge-release
description: Wait for one named PR to be ready, squash-merge it into the default branch, wait for that commit's CI to be complete and green, then create one release tag on it — with a credential the owner grants for exactly that PR and that tag. Nothing else. Use when the manager starts a box with /merge-release.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: none
  argument-hint: "<owner/repo> <PR number> <tag>   (e.g. discobox-ai/discobox 932 v0.19.1)"
---

# Merge one PR, then tag the release

The owner asked for this (2026-11-10): "launch a worker that will watch
pr932 and merge as soon as it's green and then tag main with 0.19.1. I'll
give that box access." So this box does **one merge and one tag**, both
named in its prompt, and stops. It is bound **no** credential; it asks the
owner for one scoped to exactly that PR's merge and that tag. Read the
`worker` skill for tags and power. This job has no issue or branch.

Pushing a `v*` tag starts the Release workflow, which publishes the release
**without** marking it Latest. The manager then validates it, and the owner
promotes it. You do none of that.

## 1. Check, before asking

`REPO`, `PR` and `TAG` come from the prompt. Read without a credential (the
repository is public; `curl` to `api.github.com`, no token):

- `TAG` matches `v<major>.<minor>.<patch>` or `v<major>.<minor>.<patch>-rc.<n>`,
  and `GET /repos/$REPO/git/ref/tags/$TAG` is 404.
- `GET /repos/$REPO/pulls/$PR` exists, its base is the default branch, and
  it's open (or already merged: go to §4 with its `merge_commit_sha`).

Anything else: tag `blocked`, one line on the screen saying why, stop.

## 2. Ask for the credential, now

Exactly these routes, for 24 hours, so the owner can approve and walk away:

```sh
discobox-access request -name github-release -env-var GH_TOKEN -ttl 24h \
  -route "PUT api.github.com/repos/$REPO/pulls/$PR/merge" \
  -route "POST api.github.com/repos/$REPO/git/tags" \
  -route "POST api.github.com/repos/$REPO/git/refs" \
  -route "GET api.github.com/repos/$REPO/**" \
  -justification "Squash-merge PR #$PR into the default branch of $REPO once it is ready and green, then create the release tag $TAG on that merge commit once its CI is complete and green (owner, 2026-11-10). Nothing else." \
  -wait -timeout 24h
```

No `-hosts` flag. Never more routes, never a push route, and never use it for
anything but §4 and §6. Tag `needs-input` while it waits. Denied: tag
`blocked`, say so, stop.

## 3. Wait for the PR to be ready

Ready means **all** of these on the PR's current head:

- not a draft, and labelled `status/in-review` (the manager's sign that
  review, verify and its process check are done; green alone is not ready);
- `mergeable` true and `mergeable_state` `clean`;
- the head's CI **complete and green**: every check run `completed` with
  `success`, `skipped` or `neutral`, and the same set of check names as the
  last full CI run on the default branch (`cut-release` §1).

Don't spend turns polling. Run the wait as one background shell loop (Bash
with `run_in_background`; you're woken when it exits), checking every 2
minutes, for up to 23 hours (inside the credential's day):

```sh
eval "$(discobox-access env)"; A="Authorization: Bearer $GH_TOKEN"
api() { curl -sSf -H "$A" "https://api.github.com/repos/$REPO$1"; }
while :; do
  P=$(api "/pulls/$PR")
  [ "$(jq -r .merged <<<"$P")" = true ] && { echo MERGED; break; }
  [ "$(jq -r .state <<<"$P")" = closed ] && { echo CLOSED; break; }
  # ... the ready checks above; all true: echo "READY $(jq -r .head.sha <<<"$P")"; break
  sleep 120
done
```

Tag the box `waiting` while it runs, and keep a status line: `waiting for
#$PR: <what isn't ready yet>`. `CLOSED` without a merge: tag `blocked`, stop.
`MERGED` by someone else: skip §4 and use its `merge_commit_sha`. A
check that **failed** is not a reason to stop. The PR's worker fixes it and
pushes, so keep waiting for the new head. At 23 hours, tag `blocked`, say
what wasn't ready, and stop.

## 4. Merge

Squash, pinned to the head you checked, so a push in between is refused
rather than merged:

```sh
curl -sSf -X PUT -H "$A" "https://api.github.com/repos/$REPO/pulls/$PR/merge" \
  -d "$(jq -n --arg s "$HEAD" '{merge_method:"squash", sha:$s}')" | jq -r .sha
```

GitHub writes its usual squash title and message. A 409 (the head moved):
back to §3. A 405 that names branch protection or a required review: tag
`blocked`, quote it, stop. That's the owner's to clear. Keep the merge
commit's SHA as `SHA`.

## 5. Wait for the merge commit's CI

The default branch's CI runs on `SHA`. Wait, again in one background loop
(every 2 minutes, up to 60 minutes), until it's **complete and green**: the
same rule as §3, on `SHA`. A failure or a timeout: tag nothing, tag the box
`blocked`, say which check and why, stop. The manager and the owner decide
what follows. Tag `SHA` even if the branch has moved on since; never a
later commit.

## 6. Tag

Exactly `cut-release` §3, with `TAG` and `SHA`: create the annotated tag
object, then `refs/tags/$TAG`, then check the ref points at a tag whose
`object.sha` is `SHA`.

Name the box `merge-release: #$PR → $TAG`, write one line (`Merged #$PR as
<SHA>, tagged $TAG`), tag `ready`, and power off (`worker`, Power).

## Done when

PR `#$PR` is merged, `TAG` is on its merge commit after a complete green CI
run, nothing else was written, and the box is tagged `ready`.
