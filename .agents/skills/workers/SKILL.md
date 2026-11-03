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

Run it from this repository's root, binding GitHub with the role the job's
skill names in its frontmatter, `metadata.discobox.role` (`roles/README.md`).
Read it each time rather than remembering it; a skill's role changes with
the skill:

```sh
sed -n '/^---$/,/^---$/p' worker-skills/<skill>/SKILL.md | sed -n 's/^ *discobox\.role: *//p'
```

An ad-hoc box takes `submit`'s role. A role that isn't in
`roles/manager-request.json`'s delegate part, for that repository, is refused
at launch: add it there and ask again (`roles/README.md`).

```sh
discobox run -d --skills discobox-ai/manager//worker-skills \
  --bind 'github:GH_TOKEN,policy=roles/<role>.json,owner=<owner>,repo=<name>' \
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
  waits a little for them. Then set the issue to `status/in-progress`. Tags
  are set only after launch; `discobox run` has no flag for them.
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
  --bind 'github:GH_TOKEN,policy=roles/github-submit.json,owner=<owner>,repo=<name>' \
  https://github.com/<repo>@<defaultBranch> -p '<the owner's topic, or nothing>'
discobox tag <id> repo=<repo> job=adhoc
```

Give the owner the box ID. On the table it is one row, Doing "owner
working", Your move `–`. Count it against `workers.max` like any worker.
Don't type into an ad-hoc box, and don't answer its prompts: the owner is
driving it. The only exception is "submit box X".

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

## Retire

When a worker's PR merges or its job needs nothing more:
`discobox tag <id> to-delete --rm ready --rm blocked`, then `discobox stop <id>`.
An archived box refuses tags (409). List it for deletion anyway. The owner
deletes boxes, often before you get to them; a 404 means it's already gone.

## Disk

A worker's Docker build cache is not shared and can grow tens of GiB. When
disk is low, have idle workers run `docker builder prune -a -f`, never
`docker image prune -a`. Have them stop any dev image watcher and keep to one
Docker build at a time. Check Go caches too (`go clean -cache` once freed 80
GiB in a lead).
