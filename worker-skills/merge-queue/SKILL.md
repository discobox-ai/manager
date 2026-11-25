---
name: merge-queue
description: The owner's merge bot for discobox-ai/discobox and discobox-ai/vm. Holds the owner's own credential and runs the merge-bot script every two minutes - a PR the GitHub user ibuildthecloud approved, green, out of draft and without a conflict is merged (rebase); one with a conflict is labelled needs-rebase; one changed since the approval gets a request to re-approve. No GitHub merge queue, no auto-merge. Never pushes. Use when the manager starts a box with /merge-queue.
allowed-tools: Bash, Read, Skill, Monitor
metadata:
  discobox.role: none
  argument-hint: "(no arguments)"
---

# Merge bot

The owner (2026-11-25): "I wonder if we should just go back to simple merge
queue. Basically if everything is green just merge or label with needs
rebase ... I really don't like the complexity of the merge queue and auto
rules. I just want to turn it off. Can we go to a simpler 'merge bot'
approach? Some dead simple. simple is good."

So this box runs one script, `merge-bot` (next to this file), and reports
what it did. The script is the whole policy; don't add judgement on top of
it. Read the `worker` skill for tags and power. This job has no issue and
writes no code. You **never push** anything.

The merge-gate box (`merge-gate`) is separate: it merges small bot PRs with
no approval. Leave the PRs it is gating alone.

## 1. Ask for the credential, once

For `discobox-ai/discobox` and `discobox-ai/vm`, 30 days, API only:

```sh
args=""
for repo in discobox-ai/discobox discobox-ai/vm; do
  args="$args -route PUT api.github.com/repos/$repo/pulls/*/merge"
  args="$args -route POST api.github.com/repos/$repo/issues/*/comments"
  args="$args -route POST api.github.com/repos/$repo/issues/*/labels"
  args="$args -route DELETE api.github.com/repos/$repo/issues/*/labels/**"
  args="$args -route GET api.github.com/repos/$repo/**"
done
discobox-access request -name github-queue -env-var GH_TOKEN -ttl 720h $args \
  -justification "The owner's merge bot (2026-11-25): merge a PR in discobox or vm that ibuildthecloud approved once it is green and conflict-free (rebase); label needs-rebase on a conflict; comment when a change since the approval needs a re-approval. No git push, no settings, no workflows." \
  -wait -timeout 24h
```

A credential granted before (with the auto-merge mutation) still works: the
script uses only the routes above. Tag the box `needs-input` while it waits.
Denied: tag `blocked`, say so, stop. When it lapses, ask again the same way.

## 2. Run it

```sh
B=~/.claude/skills/merge-queue/merge-bot
$B -v            # once, to see what it would do and why each PR waits
```

Then run it for real every two minutes with the `discobox-monitor` skill's
command monitor, which wakes you only when its output changes:

```sh
discobox-monitor enable command --name merge-bot -o cmd="$B --apply" -o every=2m
```

What the script does, for every open PR the owner (`ibuildthecloud`) has
approved:

| State | Action |
|---|---|
| The approval doesn't hold: a later review, or the head changes the patch (its diff against its base, without context lines and without the ADR index, differs from the approved commit's, by `git patch-id`) | One comment asking the owner to re-approve at the head |
| Draft, or a check not finished or not green | Nothing yet |
| Conflicts with its base | Label `needs-rebase` (once); the manager wakes the PR's worker to rebase |
| Approved, green, no conflict | Merge it (rebase, pinned to the head sha); remove `needs-rebase`. Every PR that qualifies merges in the same run: no waiting, no ordering, and main's own CI isn't waited on (owner, 2026-11-25: "I don't want it to serialize things") |

Your approval stands unless code that runs changed (owner, 2026-11-25:
"that approval should stand unless behavioral change has been introduced
since the approval. I simple rebase or CI fix should not invalidate the
approval"). The script compares the PR's change at the approved commit and
at the head without context lines and without tests, test data, docs,
Markdown and CI workflows: a rebase, an ADR index conflict, or a CI or test
fix keeps the approval; a change to code that runs asks for a re-approval.

## 3. Report

On each monitor event, write one line per action the script printed on
your screen (`merged`, `needs-rebase`, `re-approve`), and nothing when it
printed nothing. A `merge refused` line means GitHub said no. For example,
a ruleset on the branch still requires a merge queue: tell the manager on
your screen once, with the reason, and carry on.

## 4. Rules

- Never merge anything the script didn't, never push, never change settings.
- The manager reaches you by typing into this box. "Stop" means disable the
  monitor (`discobox-monitor disable merge-bot`) until told to start again.
- Don't sleep the box: the credential and the monitor stay with it.
