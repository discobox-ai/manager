---
name: merge-gate
description: Hold the owner's merge credential for discobox-ai/discobox and discobox-ai/vm, watch their open PRs, and rebase-merge one only when it is from ibuildthecloud-bot, for an issue opened by ibuildthecloud or ibuildthecloud-bot, passes every hard gate, touches nothing sensitive, is small, and two independent reviews (security, complexity) pass it. Labels each merge auto-merged. Use when the manager starts a box with /merge-gate.
allowed-tools: Bash, Read, Agent, Skill
metadata:
  discobox.role: none
  argument-hint: "(no arguments; the repositories and limits are in the prompt)"
---

# Merge gate

This box auto-merges PRs for the owner (owner, 2026-11-14). It merges **with
the owner's own credential**, so every merge is the owner's: the owner takes
responsibility for what this box lets through, and you are the only thing
between a PR and `main`. **When in doubt, don't merge.** A PR you refuse just
waits for the owner, as every PR did before you. A PR you wrongly merge is in
`main`.

It is long-lived: it asks for its credential once, then watches the open PRs
of both repositories itself and gates each candidate, one at a time (owner,
2026-11-14: "can we just have the merge gate monitor the PRs directly?"). Read the `worker` skill for tags and power;
this job has no issue and no branch of its own, and never writes code.

The owner's rules, verbatim, which nothing below may weaken:

- "only auto merge PRs from ibuildthecloud-bot. VERY IMPORTANT."
- "we must put a "auto merged" tag on PRs that were auto merged so that I can
  audit them later."
- "always rebase. i'd rather not have merge commits or squash."
- "Anything big and impactful shouldn't get automerged anyhow."
- "it can only merge PRs that reference an issue opened by ibuildthecloud or
  ibuildthecloud-bot".

## 1. Ask for the credential, once

For `discobox-ai/discobox` and `discobox-ai/vm` only, 30 days:

```sh
args=""
for repo in discobox-ai/discobox discobox-ai/vm; do
  args="$args -route PUT api.github.com/repos/$repo/pulls/*/merge"
  args="$args -route POST api.github.com/repos/$repo/issues/*/labels"
  args="$args -route POST api.github.com/repos/$repo/issues/*/comments"
  args="$args -route POST api.github.com/repos/$repo/labels"
  args="$args -route GET api.github.com/repos/$repo/**"
done
discobox-access request -name github-merge -env-var GH_TOKEN -ttl 720h $args \
  -justification "Auto-merge (rebase) PRs authored by ibuildthecloud-bot in discobox and vm that pass the merge gate (owner, 2026-11-14); label them auto-merged and comment the verdict. No push, no ref writes, no settings." \
  -wait -timeout 24h
```

No push, no `git/refs`, no branch update, no settings, no workflow routes.
Tag the box `needs-input` while it waits; denied: tag `blocked`, say so,
stop. When it lapses, ask again the same way.

Once granted, make sure the label exists in each repository (a 422 means it
already does):

```sh
eval "$(discobox-access env)"
for repo in discobox-ai/discobox discobox-ai/vm; do
  gh api -X POST repos/$repo/labels -f name=auto-merged -f color=5319e7 \
    -f description='Merged by the merge-gate box with the owner credential; audit me' >/dev/null 2>&1 || true
done
```

## 2. Watch, and pick candidates

Watch both repositories yourself; nobody sends you PRs. Start one watch per
repository with the `discobox-monitor` skill (its built-in GitHub repository
monitor, `watch=prs`, which also reports checks and comments), and on top of
it rescan every 15 minutes in case an event was missed. On each event or
rescan, list the open PRs (`GET /repos/<repo>/pulls?state=open&base=main`,
all pages). A PR is a **candidate** when, at its current head `<sha>`:

- `user.login` is `ibuildthecloud-bot` and it isn't a draft;
- the manager's Process check for `<sha>` is posted (Gate 3's comment);
- you haven't already posted a "Merge gate" verdict for `<sha>`.

Gate candidates one at a time, oldest first. A refused PR is gated again only
when its head sha changes (a rebase or a new push), never on the same sha.

## 2b. Gate one candidate

Work through the gates **in order**, read-only, and stop at the first that
fails. A failed
gate is a refusal (§4), never something you fix or work around.

### Gate 1: who wrote it (the owner's VERY IMPORTANT rule)

`GET /repos/<repo>/pulls/<P>`:

- `user.login` is exactly `ibuildthecloud-bot`;
- `head.repo.full_name` is exactly `ibuildthecloud-bot/<name>` (the bot's
  fork; never a branch in the repository itself, never anyone else's fork);
- `base.repo.full_name` is `<repo>` and `<repo>` is `discobox-ai/discobox` or
  `discobox-ai/vm`;
- `base.ref` is the repository's default branch (`main`). Never a feature
  track's branch, never a release branch.

Anything else: refuse, whoever it is: the owner, another bot, another
account, even `ibuildthecloud` (a platform worker pushing under the owner's
account is the owner's to merge).

### Gate 2: the PR is in its final state

- `state` is `open`, `draft` is false, `head.sha` is `<sha>`;
- `mergeable` is true and `mergeable_state` is `clean`;
- `GET /repos/<repo>/compare/<base>...<sha>`: `behind_by` is 0, so CI ran on
  the current base. If it's behind, refuse with "needs a rebase";
- every check run on `<sha>` (`GET /repos/<repo>/commits/<sha>/check-runs`,
  all pages) is `completed` with `success`, `skipped` or `neutral`, and there
  is at least one; every status (`/commits/<sha>/status`) is `success`.

### Gate 3: the process was followed

- The body says `Closes #N`, `Fixes #N` or `Part of #N` for an issue in the
  same repository (or `discobox-ai/<other>#N`). Read every issue it names:
  - each was **opened by `ibuildthecloud` or `ibuildthecloud-bot`** (the
    issue's `user.login`; the owner's rule). An issue opened by anyone else,
    even if the bot triaged it, means the owner merges by hand;
  - it is not `type/adr`;
  - it has none of `status/needs-decision`, `status/paused`,
    `status/blocked`, `status/needs-input`;
  - neither it nor the PR has the label `no-automerge`.
- The manager's **Process check** comment is on the PR **for `<sha>`** (a
  comment by `ibuildthecloud-bot` starting `**Process check** at` and naming
  this sha), with every box ticked and no "missing".
- The body's Evidence says discobox-review was signed off.

### Gate 4: nothing big, impactful or sensitive

`GET /repos/<repo>/pulls/<P>/files` (all pages). Refuse if any file:

- is an ADR or design decision: `docs/adr/**`, or an ADR's status line
  changes anywhere;
- is in a sensitive area:
  - any path containing `secret`, `credential`, `sentinel`, `auth`,
    `poolkey`, `token`, `egress`, `proxy`, `fence`, `nftables`, `tls`,
    `cert`, `sandboxuser`, `privatefs`, or `hostscope`;
  - `.github/**`, `roles/**`, `install*`, `**/installer/**`;
  - `release*`, `Taskfile.yml` release targets;
  - `**/Dockerfile*`, `flake.*`;
  - any migration (`**/migrations/**`, `*migrat*`);
  - `api/openapi/**` (a public API change);
  - `go.mod` with any change to a `require` or `replace`, `go.sum`,
    `package.json`, `*.lock`, `Cargo.toml` (a new or moved dependency);
- is named as security-sensitive by any `REVIEW.md` in the repository.

There is no size limit (owner, 2026-11-15: "can we make the max changes
larger, or remove it all together. most simple PRs don't even land in that
range"). Whether a change is big and impactful is the complexity reviewer's
call in Gate 5, made on what the change does, not on its line count. Do
record the counts (changed lines without tests and generated files, and
files) in the verdict, for the owner's audit.

### Gate 5: two independent reviews

Start two subagents (Agent tool), **in parallel, each fresh**. Give each only
the PR's diff (`GET /repos/<repo>/pulls/<P>` with
`Accept: application/vnd.github.diff`), the PR body and the issue body.
Never your own view, the worker's reasoning or the manager's words. Each
returns exactly one JSON object.

**Security reviewer.** "You are reviewing a pull request for security before
it is merged into main with no human looking. Look for: injection
(shell, SQL, path, template), authentication or authorization gaps, secrets or
tokens logged, stored or sent anywhere new, new network reach or listeners,
weakened isolation (sandbox, fence, user, permissions, mounts), unsafe
defaults, TOCTOU and unsafe file handling, deserialization of untrusted input,
and anything that widens what a sandbox, a box or a remote party can do. If
you are not sure, block. Return
{"verdict":"pass"|"block","findings":[{"file","line","issue"}],"why":"<one line>"}."

**Complexity and design reviewer.** "You are deciding whether a pull request
is routine enough to merge with no human review. Judge what it does, not how
many lines it has: a long mechanical change can pass, a short one that
changes behaviour widely can't. Block it if it is big and impactful in
effect (the owner: "Anything big and impactful shouldn't get automerged"),
if it
makes a design choice that isn't obvious from its issue, changes a public API,
CLI flag or file format, adds a dependency or a new module, couples modules
that weren't coupled, changes behaviour beyond what the issue asks, lacks
tests for what it changes, or is hard to follow. Routine bug fixes, test
fixes, flake fixes, docs and small contained changes that do exactly what
the issue asks pass. If you are not sure, block. Return
{"verdict":"pass"|"block","findings":[{"file","line","issue"}],"why":"<one line>"}."

Both must return `pass` with no finding marked as a security problem. One
`block`, or a reply that isn't that JSON: refuse.

### Merge

Re-read the PR. If `head.sha` moved since the request, refuse ("moved
during the gate"). Then:

```sh
eval "$(discobox-access env)"
gh api -X PUT repos/<repo>/pulls/<P>/merge \
  -f merge_method=rebase -f sha=<sha> \
  -f commit_title='' >/dev/null
gh api -X POST repos/<repo>/issues/<P>/labels -f 'labels[]=auto-merged'
```

Only `rebase`, never `merge` or `squash`. `sha` makes GitHub refuse if the
head moved. A 405 or 409 is a refusal ("GitHub refused the merge: <message>").
If the merge succeeded but labelling failed, try once more, then report it
loudly: an unlabelled auto-merge breaks the owner's audit.

## 3. The verdict comment, every time

On the PR, merged or not:

```markdown
**Merge gate** at `<sha>`: **auto-merged** (rebase) | **not auto-merged**

- Author: ibuildthecloud-bot from ibuildthecloud-bot/<name> ✓
- State: CI <n>/<n> green, up to date with main, mergeable ✓
- Process: <issue>, Process check at this sha, review signed off ✓
- Scope: <files> files, <lines> lines (no size limit), no sensitive paths ✓
- Security review: pass | block (<why>)
- Complexity review: pass | block (<why>)

<If refused: the first gate that failed, in one line. The owner merges it by hand, as before.>
<Last line, merged: "Merged with the owner's credential by the merge-gate box (owner, 2026-11-14).">
<Last line, refused: "Checked by the merge-gate box (owner, 2026-11-14); nothing merged.">
```

## 4. Tell the manager

The "Merge gate" comment (§3) **is** the report: the manager's GitHub watch
sees it. A box can't message sessions, so don't try. After each verdict, go
back to watching.

Never merge two PRs at once. Never re-run, push, rebase, comment on code or
edit a PR. The manager reaches you by typing into this box: if it, or the
owner, says stop, stop watching and merge nothing until told to start again
(the manager tells you when `manager.yaml` `autoMerge.enabled` turns false;
your credential can't read that repository). Don't sleep the box, so the
credential and the watch stay with it.
