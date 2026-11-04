---
name: workers
description: Start, steer, check and retire worker discoboxes for the manager. Use when launching a worker for an issue, typing into one, reading its screen, answering its mechanical prompts, approving its credential requests, or retiring it.
---

# Workers

The box's own environment already points `discobox` at the right server:
don't set or unset `DISCOBOX_SERVER`, `DISCOBOX_API_URL` or `DISCOBOX_TOKEN`
(owner, 2026-11-04). GitHub comes from:

```sh
eval "$(discobox-access env)"   # GH_TOKEN
```

## Launch

**Use `scripts/launch`** (owner, 2026-11-04). It reads the harness, server, fork
owner and default branch from `manager.yaml`, the role from the worker skill,
and the one delegated GitHub secret; refuses while this checkout is dirty or
unpushed or `workers.paused` is true; runs the box; tags it; moves a deliver or
ADR issue to `status/in-progress`; and presses Enter on a Codex box's "Trust
this folder?" dialog. Never type `-H codex` or the rest of the command by hand:
a hand-typed harness only matches `manager.yaml` until the owner changes it.

```sh
scripts/launch deliver-issue --repo discobox-ai/discobox --issue 566
scripts/launch triage-issue  --repo discobox-ai/discobox --issue 561
scripts/launch propose-adr   --repo discobox-ai/discobox --issue 564
scripts/launch deliver-issue --repo discobox-ai/discobox --issue 564 -p 'Deliver #564. Investigate first; ADR only.'
scripts/launch validate-release --repo discobox-ai/release-validation --issue 3 --no-source -p '/validate-release fresh v0.18.1'
scripts/launch ... --dry-run     # print the harness, role and command, launch nothing
```

Then add the table row (`scripts/table add`). What follows is what the script
does, for reading and for launches it doesn't cover (ad-hoc and prototype
boxes, which take `--role github-submit`).

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

**Workers run the harness `workers.harness` names** (owner, 2026-11-04;
`manager.yaml`, now `codex`): read it with
`HARNESS=$(sed -n 's/^  harness: *//p' manager.yaml)` and pass `-H "$HARNESS"`
to every `discobox run` below. Boxes already running keep theirs. The prompts
and the screen-reading in this skill were written against Claude Code (its
permission prompts, `AskUserQuestion` dialogs): check a new harness's first
boxes before trusting the rest. A Codex box first shows a "Trust this folder?"
dialog for its own checkout (`/workspace/<repo>`): press Enter on "Trust and continue"
(first Codex box, 2026-11-04; it then worked normally).

**Workers push to the bot's forks** (owner, 2026-11-03): the bot can't write
to the product repositories. A role that pushes (`github-deliver`,
`github-submit`) takes `forkOwner`, and the box gets a `fork` tag:

```sh
FORK=$(sed -n 's/^  forkOwner: *//p' manager.yaml)   # ibuildthecloud-bot
```

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

`discobox run` resolves the repository and `--skills` with this box's own
git, which has no GitHub login: without the helper below every launch fails
with `could not read Username for 'https://github.com'` (2026-11-03).

```sh
H='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'
export GIT_CONFIG_COUNT=2 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0= \
  GIT_CONFIG_KEY_1=credential.helper GIT_CONFIG_VALUE_1="$H"
discobox run -d -H "$HARNESS" --skills discobox-ai/manager//worker-skills \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/<role>.json,owner=<owner>,repo=<name>${FORK:+,forkOwner=$FORK}" \
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
  `discobox tag <id> repo=<owner>/<name> issue=<N> job=<job> fork=$FORK --description '<repo>#<N>: <title>'`
  (`fork` only for a role that pushes: deliver, ADR, fix, rebase, ad-hoc).
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
discobox run -d -H "$HARNESS" --skills discobox-ai/manager//worker-skills \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/github-submit.json,owner=<owner>,repo=<name>,forkOwner=$FORK" \
  https://github.com/<repo>@<defaultBranch> -p '<the owner's topic, or nothing>'
discobox tag <id> repo=<repo> job=adhoc fork=$FORK
```

Give the owner the box ID. On the table it is one row, Doing "owner
working", Your move `–`. Count it against `workers.max` like any worker.
Don't type into an ad-hoc box, and don't answer its prompts: the owner is
driving it. The only exception is "submit box X".

### Release validation boxes

To validate a release (owner, 2026-11-03), open a tracking issue in
**discobox-ai/release-validation** ("<from> → <to>"), then start two
**empty** boxes with the `validate-release` skill and its role
(`github-deliver` on release-validation; each clones the repository itself,
since this box's credential has no git route to it, and opens one PR there):

```sh
discobox run -d -H "$HARNESS" --skills discobox-ai/manager//worker-skills \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/github-deliver.json,owner=discobox-ai,repo=release-validation,forkOwner=$FORK" \
  --no-source -p '/validate-release upgrade <from> <to>'      # and a second box: '/validate-release fresh <to>'
discobox tag <id> repo=discobox-ai/release-validation issue=<N> job=validate fork=$FORK
```

Each opens a run PR (new baseline, note edits) and posts one report on the
issue. Findings come as "Issue to file" comments for discobox-ai/discobox:
file them there. The owner merging a run PR accepts the run; then retire its
box.

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

### Pulling a box in (adoption)

A box the owner started on their own, not through you, joins by adoption:
the `adopt` skill (`/adopt <id or description>`). You find it, lead it,
write its issue, tag it, give it its role's credential and brief it. The box
itself runs no process step and asks for nothing.

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
   `issue=<N>` tag; set `job=deliver` for *carry-on*. For *waiting-on-adr*,
   keep the box: when its ADR PR merges, set `job=deliver` and type "ADR PR
   #<P> merged; carry on as deliver-issue for #<N>" into it.

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

```sh
discobox send <id> '<text>' && discobox send-key <id> Enter
```

A message with newlines stays one message (it arrives as a paste). Never type
into a worker that has a question dialog open: it would answer the dialog.

## Mechanical prompts you answer yourself

- **Login expired:** type `continue`, then Enter. It isn't a real expiry.
- **First-run permission dialog** ("Make auto mode your default permission
  mode?"): the owner's answer is "No, keep bypass permissions". Press Down,
  then Enter.

## Credential requests

Workers get GitHub from their role at launch and usually don't ask for it.
Approve a request when it is appropriate for the box's job: what you would
have bound at launch, such as an adopted box asking for its job's role
(`adopt`). Anything wider (another repository, merge, labels, a draft token,
any other secret) goes on the table for the owner, with what it asked for
and why (owner, 2026-11-04). To approve:

```sh
discobox secret request ls -o json            # .secretRequests[] with status pending
discobox secret request approve <id>
```

- Approve **without `--secret`**. With it, the CLI first reads the box's
  bindings (GET `/secret-bindings`), which a box's role refuses (`403 ... not
  in the sandbox role`), and never sends the approval. Without it, the
  approval goes straight through (2026-11-04; discobox#616).
- `secret request get` and `ls` can't decode an approved request today
  (`unexpected field "approvedAs"`). Read a pending request before approving.
  Afterwards, the box's own `discobox-access list` or the workers monitor
  tells you it landed.
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
  process comment), a rebase it's due (Rebases, below). **Never for a merge or close**: retire it as it sleeps. `discobox start <id>`, wait until its
  terminal is idle at the prompt (`admin terminal screen`), then type one
  line saying why, e.g. `PR #452 has a new review; carry on (deliver-issue
  §6).`, then Enter.
- **A conflict or rebase nudge** says what to do and nothing about the PR's
  draft state: `PR N conflicts with main (PR M merged). Rebase, re-run checks,
  push to your fork.` Never write "keep it a draft": two workers took it for
  the owner's order and asked for a credential to turn a ready PR back into a
  draft (2026-11-04). If one asks for a credential anyway, deny the request
  (`discobox secret request deny ID`) and tell it none is needed.
- **A box stopped on an API error** (owner, 2026-11-04): the monitor says `stopped
  on an error`, and its screen ends with `API Error: The response stopped
  arriving. The response above may be incomplete.` Type `continue`, then Enter
  (the dialog sometimes already holds `continue`: just Enter). Look at its
  screen again after 20 seconds; if the error repeats three times, put it on
  the table for the owner.
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
it right away, without waking it to do anything: **archive it**,
`discobox rm <id>` (owner, 2026-11-03; the sandbox role archives the boxes
you created, ADR 26-11-03-724). No tag first: writing a tag starts a
sleeping box. Archiving keeps its workspace for the retention period, so
`discobox admin box unarchive <id>` brings it back if needed; then it's
purged. A 404 means it's already gone.

Don't archive a box the owner is working in (its screen shows their
session, or they opened it): leave it and say so.

## Disk

**Trim caches first: they are usually the biggest use of disk** (owner,
2026-11-03). `~/.cache` is a partition shared by the boxes on this host, and
the Go build cache there grows without bound: on 2026-11-03
`~/.cache/go-build` held 147 GiB, and trimming entries untouched for a day
freed 100 GiB (60 → 160 GiB free) in seconds. When disk nears
`disk.minFreeGiB`, before anything else:

```sh
du -sh ~/.cache/* | sort -h | tail                 # find the big ones
find ~/.cache/go-build -type f -atime +1 -delete   # Go: entries unused for a day
```

If that frees little (a busy day rewrites the cache fast), trim harder:
`find ~/.cache/go-build -type f -amin +360 -delete` (unused for 6 hours) took
51 → 12 GiB and freed 39 GiB the same afternoon.

It's a cache: a build that needs a removed entry rebuilds it, slower but
correct. Prefer a time-bounded trim to wiping it, and do it while no worker
is mid-build if you can. Other caches there (`golangci-lint`, `gopls`,
`pnpm`) can be trimmed the same way.

Then, if still short: a worker's own Docker build cache is not shared and can
grow tens of GiB. Have idle workers run `docker builder prune -a -f`, never
`docker image prune -a`. Have them stop any dev image watcher and keep to one
Docker build at a time.
