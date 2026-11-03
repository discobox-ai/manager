---
name: workers
description: Start, steer, check and retire worker discoboxes for the manager. Use when launching a worker for an issue, typing into one, reading its screen, answering its mechanical prompts, approving its credential requests, or retiring it.
---

# Workers

Every command here runs against the real server. Inside a discobox the
devShell may point the `discobox` CLI at a nested dev server, so set it first:

```sh
export DISCOBOX_SERVER=https://api.discobox.internal   # manager.yaml workers.server
eval "$(discobox-access env)"; unset DISCOBOX_TOKEN     # GitHub (GH_TOKEN) and the discobox API
```

## Launch

First make sure this checkout is committed and pushed (`github` skill, Pushing
to discobox-ai/manager): `--skills` installs from the pushed `main`, not from
local files.

**The GitHub secret's name is whatever the owner bound you**, not
necessarily `github`: the owner picks the secret when approving your request.
Read it from your delegations each time, the one credential you may delegate
that reaches `api.github.com`:

```sh
GH_SECRET=$(discobox-access list -json | jq -r '[.credentials[]
  | select(.purpose == "delegate" and (.hosts | index("api.github.com")))
  | .name] | if length == 1 then .[0] else "" end')
```

Empty means none or more than one: launch nothing, and tell the owner which
(`discobox-access list`). Never fall back to `github`.

Run it from this repository's root, binding that secret with the role the job's
skill names in its frontmatter, `metadata.discobox.role` (`roles/README.md`).
Read it each time rather than remembering it; a skill's role changes with
the skill:

```sh
sed -n '/^---$/,/^---$/p' worker-skills/<skill>/SKILL.md | sed -n 's/^ *discobox\.role: *//p'
```

An ad-hoc box takes `submit`'s role. A label migration
(`migrate-labels`) is tagged `repo=<owner>/<name> job=labels`, with no
`issue`, and its prompt is `Migrate the labels of <repo>.` A role that isn't in
`roles/manager-request.json`'s delegate part, for that repository, is refused
at launch: add it there and ask again (`roles/README.md`).

```sh
discobox run -d --skills discobox-ai/manager//worker-skills \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/<role>.json,owner=<owner>,repo=<name>" \
  https://github.com/<repo>@<defaultBranch> \
  -p 'Deliver issue #<N> in <repo>.'
```

- **Keep the prompt short: the task and its scope only.** Put everything the
  worker needs into the issue. The proxy judge clips a prompt at 256 bytes and
  reads the cut as hidden instructions. A prompt that mentions credentials,
  grants or discobox-access gets refused as handing out privileges.
- **Name the job's limits in the prompt** when they differ from the skill:
  "ADR only: draft it as Proposed, stop when its PR is green".
- **Tag the box right away**, before anything else:
  `discobox tag <id> repo=<owner>/<name> issue=<N> job=<job> --description '<repo>#<N>: <title>'`.
  The worker reads `repo` and `issue` from its tags (`worker` skill), and
  waits a little for them, then names the box for the issue and its title
  (`worker`, Name the box; `discobox tag` can't set a name). Then set the
  issue to `status/in-progress`. Tags are set only after launch; `discobox
  run` has no flag for them.
- **A launch that prints an error can still make a working box.** Seen with
  push rejections and decode errors. Before launching again, list the boxes
  you created and look for the new one. Two workers on one issue waste a slot
  and fight over the branch.

## Ad-hoc boxes

The owner never starts boxes; they ask you ("give me a box on discobox for
X"), and you start one they work in by hand. Only a box you created is one
you can read, type into and approve for later, so this is what lets the
owner's own work join the process.

```sh
discobox run -d --skills discobox-ai/manager//worker-skills \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/github-submit.json,owner=<owner>,repo=<name>" \
  https://github.com/<repo>@<defaultBranch> -p '<the owner's topic, or nothing>'
discobox tag <id> repo=<repo> job=adhoc
```

Give the owner the box ID. On the table it is one row, Doing "owner
working", Your move `–`. Count it against `workers.max` like any worker.
Don't type into an ad-hoc box, and don't answer its prompts: the owner is
driving it. The only exception is "submit box X".

### Prototype boxes

When the owner says they want to prototype something ("prototype X on
discobox"), start an ad-hoc box with the `prototype` skill: same launch and
role, prompt `/prototype <the idea, in a few words>`, tags `repo=<repo>
job=prototype`. The box knows it's prototyping: something working fast, no
tests, review or ADRs, and a `~/prototype.md` of decisions and shortcuts.
Treat it as an ad-hoc box in everything else: on the table Doing "owner
prototyping", and you don't type into it.

It ends one of two ways, and the owner says which. **Submit**: "submit box X",
below; the `submit` skill knows a prototype's code is never the PR as it
stands. **Drop**: the idea didn't hold, and the owner says so (or the box
ends on "nothing to submit"): retire the box, filing nothing.

### "Submit box X"

The owner says it to you, or types "submit" in the box themselves. When it's
you:

1. Read the bottom of its live screen. Wait until it is idle at its prompt
   with no dialog open; never type over the owner mid-turn.
2. Type `/submit`, then Enter. The box runs the `submit` skill.
3. It may ask the owner questions on the way, tagging itself `needs-input`:
   that's "Answer in the box" on the table. Don't answer them yourself.
4. It ends with a fixed comment on the issue (`submit` §5). Read its
   **Outcome** and act by `docs/gates.md`. The box has set its own
   `issue=<N>` tag; set `job=deliver` for *carry-on*.

## Read a worker's state

- `discobox admin box ls -o json`: the runtime state, and the primary
  terminal's title. Claude Code leads the title with `✳` when idle.
- `discobox admin terminal screen <id> primary`: the live screen. **Judge only
  by the bottom of the live screen** (about 15 lines), never by scrollback. An
  old dialog in scrollback was once reported as a pending question long after
  the worker had answered it and opened its PR.
- A screen still showing `esc to interrupt`, or a running background shell or
  monitor, means the worker is working, whatever the title says.

## A question without its tag

A worker asks the owner with `AskUserQuestion`, and tags itself
`needs-input` first (`worker` skill). When the bottom of a box's live screen
shows a question dialog and the box isn't tagged `needs-input`, put the tags
on yourself:

```sh
discobox tag <id> needs-input --rm ready --rm blocked
```

and set its issue to `status/needs-input` (`github` skill), with a one-line
comment naming the topic in a few words, not the question. It goes on the
table as "Answer in the box". When the dialog is gone, drop the tag
(`--rm needs-input`) and put the issue back to `status/in-progress`. The
same goes for an ad-hoc box with no issue: tag the box, and the table row
says it.

## Type into a worker

`discobox admin terminal input <id> primary '<text>'`, then a separate `Enter`.
Never type into a worker that has a question dialog open: it would answer the
dialog.

## Mechanical prompts you answer yourself

- **Login expired:** type `continue`, then Enter. It isn't a real expiry.
- **First-run permission dialog** ("Make auto mode your default permission
  mode?"): the owner's answer is "No, keep bypass permissions". Press Down,
  then Enter.

## Credential requests

Workers get GitHub from their role at launch and don't ask for it. So any
request a worker makes is outside its role: put it on the table for the owner,
with what it asked for and why, and don't approve it yourself. If the owner
says to approve it:

```sh
discobox secret request ls -o json            # .secretRequests[] with status pending
discobox secret request approve <id> --secret github
```

- The approve call can print `403 ... not in the sandbox role` while the
  approval succeeded. It's the CLI's follow-up GET of the binding. Re-read the
  request's `status` before calling it refused.
- A role that keeps turning out too narrow is a change to its file in
  `roles/`, committed and pushed, not a habit of approving.

## Power

Workers sleep whenever they wait and power off when they're done (the
`worker` skill, Power). You do the parts they can't:

- **Pause a box waiting on the owner.** A box tagged `needs-input` or
  `blocked` whose primary terminal has been idle for `workers.pauseAfter`
  (the `workers` monitor reports busy/idle): `discobox stop <id>`. A question
  dialog stops the agent from sleeping itself. Note the time it went idle
  when the event comes, and while any such box is pending, keep the waiting
  `pop` no longer than the time left (`watch`). The row stays "Answer in the
  box": opening it starts it again.
- **Wake a sleeping worker when its work needs it**: a review or comment on
  its PR, a failing check on its head, Evidence missing (`github`, The
  process comment), a rebase it's due (Rebases, below), the owner's "accept"
  for its ADR. **Never for a merge or close**: retire it as it sleeps. `discobox start <id>`, wait until its
  terminal is idle at the prompt (`admin terminal screen`), then type one
  line saying why, e.g. `PR #452 has a new review; carry on (deliver-issue
  §6).`, then Enter.
- **A box that woke on its own wake and sits idle at its prompt** (its
  harness was relaunched and didn't take a turn): type `You woke: read
  ~/.discobox/wake/.done/ and carry on.`, then Enter.
- **A worker you find idle with no state tag and nothing on screen** for
  `workers.pauseAfter`: it forgot to sleep. Type `Set your state tag and
  sleep (worker skill, Power).`
- **Capacity counts running workers.** Waking one of your workers for its
  own PR comes before starting new work; at `workers.max`, it takes the next
  free slot ahead of any launch.

`discobox tag` starts a stopped box to write the tag, so a box you tag while
it sleeps is awake afterwards: stop it again if it has nothing to do.

## Rebases

A PR that conflicts with its base needs a rebase only if it's about to be
merged. Rebasing every conflicting PR after each merge is a rebase storm:
each rebase reruns CI, and the next merge makes most of them conflict again.

- **The merge queue** is the PRs at "Review and merge" on the table, in its
  ranked order (`table`).
- **Only the top 3 of the queue get rebased.** When one of them is `dirty`,
  wake its worker: `PR #<P> conflicts with <base>; rebase it (deliver-issue
  §6).` A conflicting PR further down waits, with its row saying
  "conflicts, rebased when near the front". When a merge moves it into the
  top 3, it's its turn.
- **One rebase per PR per base.** Don't ask again while it's rebasing or its
  CI is running, and don't ask again for a base it's already rebased onto.
  After a merge, give GitHub a minute to recompute `mergeable_state` before
  acting (`unknown` means not yet).
- **A PR not yet green** isn't in the queue: its worker is still on it, and
  rebases as part of its own work.
- A worker whose box is gone gets a new `rebase-pr` worker, under the same
  rules.

## Retire

When a worker's PR merges or closes, or its job needs nothing more, retire
it right away, without waking it to do anything:
`discobox tag <id> to-delete --rm ready --rm blocked --rm needs-input`,
then `discobox stop <id>` (writing the tag starts a sleeping box; stop it
straight after).
An archived box refuses tags (409). List it for deletion anyway. The owner
deletes boxes, often before you get to them; a 404 means it's already gone.

## Disk

A worker's Docker build cache is not shared and can grow tens of GiB. When
disk is low, have idle workers run `docker builder prune -a -f`, never
`docker image prune -a`. Have them stop any dev image watcher and keep to one
Docker build at a time. Check Go caches too (`go clean -cache` once freed 80
GiB in a lead).
