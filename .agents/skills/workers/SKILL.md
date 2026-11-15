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
ADR issue to `status/in-progress`. Never type `-H <harness>` or the rest of the command by hand:
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
boxes, which take `--role github-deliver`).

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
`manager.yaml`, now `claude-code`; codex from 2026-11-04 to 2026-11-07),
**except bug fixes, which run `workers.bugHarness`** (now `codex`; owner,
2026-11-10: "bug fixes are done with codex harness and other work is done
with claude-code"). A bug fix is `deliver-issue` on an issue labelled
`type/bug` or `type/flake`, or `fix-ci`; `scripts/launch` picks it by itself
(its dry run prints `(bug fix)`), and `--harness` overrides it. **A repository
with its own `harness` in `manager.yaml` runs that for all its work**, bug or
not: discobox-ai/review runs codex (owner, 2026-11-11). An issue's
type is set at triage, so label it before launching. A box keeps the harness
it started with, even if its issue's type changes. Starting a box by hand,
read it with
`HARNESS=$(sed -n 's/^  harness: *//p' manager.yaml)` (or `bugHarness:`) and pass `-H "$HARNESS"`
to every `discobox run` below. Boxes already running keep theirs. The prompts
and the screen-reading in this skill were written against Claude Code (its
permission prompts, `AskUserQuestion` dialogs): check a new harness's first
boxes before trusting the rest. A box trusts its own folder at every start
(Codex: discobox#571, PR 707, 2026-11-05): a "Trust this folder?" dialog on a
worker is a bug in the harness. Don't press Enter on it; tell `manager-chat` with the
box's ID and the server version.

**Workers push to the bot's forks** (owner, 2026-11-03): the bot can't write
to the product repositories. A role that pushes (`github-deliver`,
`github-deliver`) takes `forkOwner`, and the box gets a `fork` tag:

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
discobox run -d -H "$HARNESS" --skills "$PWD/worker-skills" \
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
  `discobox tag <id> repo=<owner>/<name> issue=<N> job=<job> fork=$FORK base=<defaultBranch> --description '<repo>#<N>: <title>'`
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
discobox run -d -H "$HARNESS" --skills "$PWD/worker-skills" \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/github-deliver.json,owner=<owner>,repo=<name>,forkOwner=$FORK" \
  https://github.com/<repo>@<defaultBranch> -p '<the owner's topic, or nothing>'
discobox tag <id> repo=<repo> job=adhoc fork=$FORK base=<defaultBranch>
```

Give the owner the box ID. On the table it is one row, Doing "owner
working", Your move `–`. Count it against `workers.max` like any worker.
Don't type into an ad-hoc box, and don't answer its prompts: the owner is
driving it. The only exception is "submit box X".

### Cutting a release

A release is cut in three steps (owner, 2026-11-05). Only the owner starts
one ("cut v0.19.0-rc.4", "kick off an rc"):

1. **A tag box.** Pick the tag (the next `-rc.<n>` after the newest of that
   version in `gh release list`, or the version the owner names) and the
   commit (the default branch's head, its CI green; else the newest green
   one, and say which). Start an empty box with the `cut-release` skill and
   no credential:

   ```sh
   scripts/launch cut-release --repo discobox-ai/discobox --no-source \
     -p '/cut-release discobox-ai/discobox <tag> <full sha>'
   ```

   It asks the owner for a credential that can create that one tag: the bot
   can't (Triage). **Never approve it yourself**, and never ask for tag
   rights for your own credential. Table row: "Approve the tag credential
   for discobox:///<id>" (`!`). The box tags, goes `ready` and powers off;
   retire it then. It does nothing else.
2. **Watch the release.** The tag starts the Release workflow, which
   publishes a prerelease. Watch for `gh release view <tag>` to exist, with
   its assets (table row: "releasing <tag>", Your move `–`). The workflow
   failing is main CI failing (`docs/gates.md`): file it and start a
   `fix-ci` worker; a re-cut needs a new tag, which is the owner's call.
3. **Validate it**, below: from the newest stable release (`gh release list`,
   `Latest`) to the tag, and a fresh install of the tag.

The owner marking the prerelease a release (promote) is theirs, after
validation.

### Release docs, after a stable tag (owner, 2026-11-07)

When a **stable** release is tagged (`vX.Y.Z`, no `-rc`), its docs go to
discobox.ai. Prereleases never do. The installer needs nothing: the Release
workflow uploads it, and discobox.ai serves the newest stable one by itself.
The docs follow discobox-ai/site's ADR 0001 (Astro; the owner dropped the
Remix rewrite, 2026-11-07): one snapshot per minor line under
`/docs/vX.Y/`, imported from discobox-ai/discobox at the tag, and published
only through site's `main`. Two steps, each an issue in discobox-ai/site
(`github`, Filing) with a `deliver-issue` worker (site's base is always
`preview`, `worker`):

1. **Import** ("Publish the vX.Y docs from vX.Y.Z"): run site's
   `scripts/import-docs.mjs` at the tag's full commit (never a branch), so
   the manifest records the tag and SHA; make vX.Y the current line in the
   versions manifest (a patch release refreshes its line's snapshot and
   changes nothing else); build and run the docs checks; open the PR into
   `preview`. Evidence: the pages on https://preview-discobot-ai.acorn-io.workers.dev/ (the preview branch's deploy; preview.discobox.ai is stale, site#30) once it's merged
   there, `/docs/` redirecting to `/docs/vX.Y/`, the version shown on each
   page matching the tag. Row for the owner: "Review and merge" (site PRs are
   the owner's to merge, like product PRs).
2. **Publish** ("Release vX.Y.Z to discobox.ai"), once the import is on
   `preview`: bring `preview` up to date with `main` (merge `main` into a
   branch off `preview`, PR into `preview`) if it's behind, then open the PR
   from `preview` into `main`, listing every change it carries (docs, blog,
   pages), not just the docs. The owner merges it, and that deploys
   discobox.ai. Then check https://discobox.ai/docs/ serves the new line and
   say so on the release status issue.

Both go in the release status issue's Next (`table`), and that issue closes
only after step 2 is merged and checked.

### Release validation boxes

To validate a release (owner, 2026-11-03), open a tracking issue in
**discobox-ai/release-validation** ("<from> → <to>"), then start two
**empty** boxes with the `validate-release` skill and its role
(`github-deliver` on release-validation; each clones the repository itself,
since this box's credential has no git route to it, and opens one PR there):

```sh
discobox run -d -H "$HARNESS" --skills "$PWD/worker-skills" \
  --bind "$GH_SECRET:GH_TOKEN,policy=roles/github-deliver.json,owner=discobox-ai,repo=release-validation,forkOwner=$FORK" \
  --no-source -p '/validate-release upgrade <from> <to>'      # and a second box: '/validate-release fresh <to>'
discobox tag <id> repo=discobox-ai/release-validation issue=<N> job=validate fork=$FORK base=main
```

**Quiet the host first** (owner, 2026-11-07): validation measures startup
time, and the host's load skews it. Before launching the two boxes, suspend
every worker that isn't on the release's milestone, and start no new box
until both have posted their timing. Check `uptime`: launch when the
1-minute load is below the host's CPU count (`nproc`) and
`/proc/pressure/io` `some avg10` is below 10%, and say both in the tracking
issue. Disk-heavy boxes (nested builds, image loads) count even when the CPU
is quiet: suspend them too.

Each opens a run PR (new baseline, check files, notes to fold) and posts one report on the
issue. When both have reported, post **the release's timing report** on the
tracking issue and give it to the owner: one table, both modes' cold and
warm T3 totals against the baseline with the change in %, any run over 25%
named as a finding (owner, 2026-11-05). Findings come as "Issue to file" comments for discobox-ai/discobox:
file them there. The owner merging a run PR accepts the run.

The two run PRs touch disjoint files (`validate-release` §7), so they merge
in either order with no rebase. **Run PRs of different candidates** (rc.8's
and rc.9's fresh runs, say) do overlap: both rewrite
`baselines/*-<mode>.md`. The newest candidate's baselines win. When an older
candidate's run PR conflicts with a newer one already merged, start a
`rebase-pr` worker on it with: keep main's baselines, keep this PR's own
`runs/<mode>-<to>/` and check files (2026-11-07, release-validation PRs 20
and 21 after 23). **After both are merged**, if either left a
`runs/<mode>-<to>/notes.md` or the two added duplicate `checks/` files,
start one `deliver-issue` worker on release-validation (role
`github-deliver`, repo release-validation) to fold them: notes into the notes
skill, duplicate checks into one file. That's one PR, after the runs, so
nothing races it.

A validation box holds nested pools, images and VM disks, and it can grow by
tens of GiB in minutes (rc.6's fresh box: archiving it freed 17G at once,
2026-11-06). **Archive it as soon as its report is posted and its run PR is
pushed**: don't keep it for later edits or rebases. A rebase or fix to its
run PR goes to a `rebase-pr` worker instead. Suspending it saves nothing on
disk.

### Prototype boxes

When the owner says they want to prototype something ("prototype X on
discobox"), start an ad-hoc box with the `prototype` skill: same launch and
role, prompt `/prototype <the idea, in a few words>`, tags `repo=<repo>
job=prototype`. When they want no main source but others to read from, use
`--no-source` with `-i OWNER/REPO` for each (`scripts/launch`; public
repositories only). The box knows it's prototyping: something working fast, no
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

### Feature tracks (owner, 2026-11-07)

A feature track is long-running work on its own integration branch,
listed under `tracks` in `manager.yaml`: its repository, `branch`, `epic`
(the issue whose checklist names its issues) and who merges into the branch.
The first is the desktop console: `feature/desktop-console`, epic
discobox#786, merged by you.

- **Launching.** `scripts/launch` finds the track itself: an issue the epic
  lists starts from the track's branch and its PR targets it (`base` tag).
  Never start track work from the default branch. ADRs merged into the
  track's branch are accepted for the track (`deliver-issue` §0), and you
  merge ADR PRs into it like any other: the owner said "You can merge
  anything that goes to the feature branch, even adr" (2026-11-07).
- **When.** Track issues take slots after the current release milestone's
  work and before anything else, in the epic's phase order (P0 first) and
  each issue's "Depends on". Suspend track boxes while release validation
  measures timing (§ Release validation boxes), like any non-release work.
  **A track never idles by itself.** "Release work goes first" orders slots
  when they're short. It never stops the track while slots are free. An
  issue in the epic's checklist whose "Depends on" are all done is ready,
  label or not: label it `status/ready` and start it. Only the owner pauses
  a track, and an open PR from the track's branch to main is not a pause.
  On every heartbeat with free slots, a quiet host and no validation timing,
  check: no track box running, but the epic has ready issues, means a
  stall. Start them (2026-11-10: the desktop track sat idle five hours on
  an unlabelled #811 and a misread priority).
- **Merging into the branch** (`merge: manager`): you merge, the owner
  doesn't. A track PR is ready when its checks on its head are green (until
  the track's own CI exists, discobox#788, there may be none: then its
  Evidence must show the repository's suites passing locally), its review
  has signed off, its verify passed or says why it couldn't, a visible
  change has its screenshots in the Evidence, from the bot fork's `assets`
  branch (`verify`, Capture; owner, 2026-11-10), its process
  comment is posted, and it's rebased on the track's branch with nothing
  between them. Then have the track's **merge box** fast-forward the branch
  to the PR's head: type `Merge PR #<P> at <sha>` into it. That box
  (`merge-track` skill, role `none`, started once per track with
  `scripts/launch merge-track --repo <repo> --no-source -p '/merge-track <repo> <branch>'`
  and tagged `job=merge`) is the only holder of a credential that reaches
  only that branch's ref, which the owner approves (owner, 2026-11-07); it
  re-checks the PR and moves nothing that isn't a green fast-forward. GitHub
  marks the PR merged. A PR that isn't a fast-forward goes back to its worker
  to rebase first; never force. The merge box is never retired while its
  track is open, and never counts against `workers.max` while idle.
- **Deciding for the track** (`decide: recommended`; owner, 2026-11-10:
  "for the desktop works, can we monitor it and always go with the agents
  recommended solution, we want this to run without intervention"). A track
  box stopped on a question is not "box needs input" for the owner: answer
  it yourself, at once, with the option the worker recommends, typed into
  the box, and tag it back from `needs-input`. With no recommendation, pick
  what the track's ADRs, the epic and the owner's earlier words point to,
  and say why. Then comment on the issue: the question, the options, what
  you chose and that it was the worker's recommendation (owner's
  delegation). The owner reads those comments, not prompts.
  This covers design choices, scope, keys, wording, ADR choices, a review
  finding to fix or defer, and a follow-up issue to file under the epic.
  It doesn't cover, and these still go to the owner: a credential or
  permission wider than the box's role (signing certificates, an Apple
  Developer ID), anything that writes outside the track's branch (main,
  another repository, a release), and a choice that weakens security (an
  unescaped path, a skipped check, a wider grant), even when it's the
  recommendation. Pick the safer option instead and note it.
  Also: a question the worker puts on the issue or PR rather than the
  screen gets the same answer there. Never let a track box sit waiting.
- **Issues don't close themselves** on a merge into a branch that isn't the
  default: close the issue with a comment naming the PR, tick it in the
  epic's checklist (edit the epic's body), and retire the box.
- **Keeping up with main.** When a track PR conflicts because main moved, or
  every week or so, start a `deliver-issue`-style job on the epic: merge the
  default branch into a branch off the track's branch, run the suites, open
  a PR into the track's branch; you fast-forward it like any other.
- **Into main**, once: the epic's merge criteria (its last P7 issue) hold,
  a PR from the track's branch into the default branch, and the owner merges
  that one.
- **On the table:** one row per track issue with a box or a PR; the epic's
  row says the phase it's in.

### Provider credentials (owner, 2026-11-10)

The owner delegated boxd and archil API keys (`manager.yaml` `providers`)
for the remote-drivers track. Bind one at launch, only to a box whose job
needs that real provider (its issue says so, or its worker asks), with
`scripts/launch ... --bind "<providers.X.bind>"`. Always with the hosts:
the boxd delegation came back as any host, so the bind is what keeps the
key on boxd.sh. A box already running that needs one asks with
`discobox-access request` for exactly that secret and those hosts, and you
approve it. Anything else (another provider, a wider host) goes to the
owner. The boxd grant expires 2026-12-10: ask the owner again before then.

### Auto-merge: the merge-gate box (owner, 2026-11-14)

The owner: "I want to setup an auto merge bot. But I want to ensure that we
don't introduction security issues, skip critical design, or violate our
process ... this will work as something that I effectively take
responsibility for." And: "only auto merge PRs from ibuildthecloud-bot. VERY
IMPORTANT." `manager.yaml` `autoMerge` holds the settings; `enabled: false`
stops it at once.

- **One box, long-lived:** `scripts/launch merge-gate --repo
  discobox-ai/discobox --no-source -p '/merge-gate'`, tagged
  `job=merge-gate`. It asks the owner for their own
  credential, narrowed to merge, label, comment and read in discobox and vm
  (the skill's §1). The owner approves; you never do. Never retire it, and
  it never counts against `workers.max` while idle. If it's gone or its
  credential lapsed, relaunch it or put "approve merge-gate's credential" on
  the table.
- **It watches discobox and vm itself** (owner, 2026-11-14: "can we just
  have the merge gate monitor the PRs directly? We don't need to feed the
  merge requests to it"). You don't send it PRs. Your part is the Process
  check: post it, in the github skill's checklist format, on every ready
  PR for its head sha, as before, because the gate only considers a PR
  that has one. It merges only PRs by `autoMerge.author` whose every
  referenced issue was opened by `ibuildthecloud` or `ibuildthecloud-bot`
  (owner, 2026-11-14), and never ADR or feature-track PRs.
- **release-validation run PRs too** (owner, 2026-11-15: "can we hvae the
  auto merge watch release-validation and auto merge the "validate: ..."
  PRs", any verdict). It merges a `validate: …` PR there by its own gates
  (`merge-gate` §2c: the bot's, mergeable, a tracking issue the owner or
  the bot opened, files under `runs/`, `baselines/`, `checks/` only, no
  secret in them). They need no Process check from you. Merging one
  accepts the run, so its report and timing on the tracking issue still go
  to the owner as before. A refused "needs a rebase" gets a `rebase-pr`
  worker, as in Release validation boxes. Every other release-validation PR
  (a notes fold, a skill change) the owner still merges.
- **Stopping it:** when `autoMerge.enabled` turns false, or the owner says
  stop, type into the box to stop watching.
  Tell it to start again when it turns back on.
- **Its reports** are its "Merge gate" PR comments, which your GitHub watch sees (a box can't message sessions): `Merged …` means the PR is in main, with the label
  `auto-merged` and a "Merge gate" comment. Treat it like an owner merge:
  close the issue if the PR didn't, retire the worker, run `scripts/table
  sync`, and note it in the next status to the owner ("auto-merged: …").
  `Refused …: <gate>` leaves the PR on the table as "Review and merge" for
  the owner, with the reason in the row's `doing`. A "needs a rebase"
  refusal wakes its worker for a rebase; the gate sees the new sha by itself.
- **The owner's audit:** the label `auto-merged`. Never remove it, never add
  it by hand.

### Platform workers: macOS and Windows (owner, 2026-11-10, 2026-11-11)

We can't run macOS or Windows boxes. The owner runs one agent on each
platform (`manager.yaml` `platformWorkers`): `macos-worker` on a Mac and
`win-worker` on Windows (its project root is the latest disco-vm `main`).
Each is reachable by SendMessage like any session (`ListAgents` shows
`<name> [<ref>]`; they're on Remote Control, so nothing reports back on
delivery) and holds the ibuildthecloud-bot credential. **Each is one
agent: its work is serialized**, a separate queue per worker.

- **Only `manager-loop` gives them jobs**, one at a time each, and keeps the
  queues: one table row per worker lists the job running and those waiting,
  in track priority. `manager-chat` never sends them work; it relays the
  owner's words to the loop.
- **What goes to them:** what needs that platform: darwin or windows
  builds and tests, real-guest runs (vz on the Mac, hcs on Windows), and
  fixes that only show there. Linux-doable code is written by Linux workers
  in boxes as usual; when a PR needs platform proof, its worker says so
  (Evidence: "needs macOS/Windows verification") and you queue it.
- **Two kinds of job.** *Verify:* run a PR or branch and report; it may push
  fixes to that PR's branch on the bot fork. *Deliver:* an issue whose work
  can only be done and run on that platform (the owner assigns it, e.g.
  vm#74 to win-worker): it branches on the bot fork from the repository's
  default branch, fixes, runs it for real, reviews with `discobox-review` to
  sign-off, and opens one PR that `Closes #N` with an Evidence section
  (what it ran on which host, review state), as `deliver-issue` asks of any
  worker. Never merges. An ADR-sized choice inside it goes on the issue as a
  question for the owner, with its recommendation, not into the code.
- **A job is one message**, self-contained: the repository and issue, the
  PR and its head sha (or the branch), what to run or fix, what counts as
  done, and where to report. It reports on the issue or PR as a comment
  (the durable record, which the watch sees) and replies to `manager-loop`
  with one line: done, failed or blocked, and the link.
- **Next job** only after the last one's comment is up. No reply and no
  comment within the job's own time estimate: send one status question,
  never a resend of the job.
- **Credentials** beyond the bot's (an Apple Developer ID, signing, a
  provider account) go to the owner, as for any worker.
- **Nothing mounts on win-worker's host** (owner, 2026-11-14: "last time
  the testing froze the machine by mounting something and that locked the
  entire machine"). Every win-worker job message carries this guard: no
  VHD/VHDX or ISO mounts (`Mount-DiskImage`, `Mount-VHD`, `diskpart
  attach`), no HCS or WSL operation that attaches a disk at host level, and
  no host SMB or virtiofs mounts. If a job truly needs one, the worker stops
  and asks the owner on that machine first, naming exactly what it would
  mount and how it unmounts. It runs only on the owner's go-ahead,
  time-boxed, with the unmount in a `finally`. Prefer unit tests, builds and
  the `windows` CI target's own commands.

### Repositories with an interactive pre-harness

A repository with `.discobox/scripts/pre-harness` (discobox-ai/tour: the tour
itself) runs it before the harness on every primary terminal start, so a
worker launched there waits at that script's screen and never starts its
prompt (discobox#876, 2026-11-09). Until #876 gives a way to skip it, after
launching a worker in such a repository read its screen, step through the
script to the harness (for the tour: Enter, then `c`), and if the harness
then says "No conversation found to continue", type the task in yourself.
Don't let it idle into a pause first.

### Taking over a PR (owner, 2026-11-07)

The owner (or a teammate) opened a PR by hand, and asks you to "take over
PR N" or "adopt PR N into our process". Only on their word, and only for a
trusted author: `author_association` `OWNER`, `MEMBER` or `COLLABORATOR`
(`gh api repos/<repo>/pulls/<N> --jq .author_association`). A community PR is
never taken over (`github`, Closing).

1. **Back-fill the issue(s).** Use the PR's own issue if it has one. Otherwise
   file it from the PR's body (`github`, Filing): Today / Wanted / Done when,
   the PR's description as the design, and what its author tested. One issue
   per independent change: a PR that fixes two things gets two issues. Give
   it the milestone the owner says, else the release the regression is in (say
   so), with `status/ready`. Leave the PR's own design decisions alone: an
   ADR in it that the owner wrote is their decision, and stays as written.
2. **Comment on the old PR**: `Taken over by the manager: tracked as #<issue>;
   a bot PR will supersede this one.` Set its milestone to the issue's.
3. **Launch a `deliver-issue` worker** for the issue (the usual role and
   tags), with the prompt
   `/deliver-issue <issue>` and the line
   `Take over PR #<old>: deliver-issue §0b.`
4. **When the worker's PR is open**, close the old PR: comment `Superseded by
   #<new>, which carries these commits through review and verify.`, then
   `gh api -X PATCH repos/<repo>/issues/<old> -f state=closed` (a PR is an
   issue to this API; the `pulls` endpoint is refused). Don't wait for the
   merge: `Closes #<old>` in a PR body doesn't close a PR (GitHub's closing
   keywords close only issues), and two open PRs for one change split the
   review. If the takeover is abandoned, reopen it the same way
   (`state=open`).
5. On the table, the old PR's row goes; the issue's row follows the worker
   as usual.

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
- **A stopped box's screen is readable too** (owner, 2026-11-09):
  `discobox capture <id>` prints its last screen without starting it, and
  `--scrollback N` the lines above. Read it before deciding a stopped box
  finished, asked something, or died (an API or credit error ends a turn
  without a question). Start a box only to type into it.

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

- Approve **without `--secret`** while the manager holds only one delegated
  secret. With it, the CLI first reads the box's bindings (GET
  `/secret-bindings`), which a box's role refuses (`403 ... not in the
  sandbox role`), and never sends the approval (2026-11-04; discobox#616).
  When more than one secret is delegated (github-bot, archil, boxd), the
  server answers `400 ... name which with --secret` and lists their ids:
  pass `--secret <sec_ id of github-bot>` (2026-11-14, that worked).
- **One path per route.** The server approves only a request whose every
  route is provably within one delegated route. A route listing two paths
  (`GET /repos/a/**,/repos/b/**`) or mixing a fork's push with upstream
  reads is refused with `403 no live delegation covers this whole grant`.
  Deny it and send the worker the exact list, one method and path per
  route: the fork's `.git/**`, GET each `/repos/<owner>/<repo>/**`, POST
  `issues/*/comments`, POST `pulls`, PATCH `pulls/*` (2026-11-14, #1096).
- A worker asking for the `github` secret (not `github-bot`), or for push
  to an upstream `.git`, is wider than its role: deny it and say which to
  ask for.
- `secret request get` and `ls` can't decode an approved request today
  (`unexpected field "approvedAs"`). Read a pending request before approving.
  Afterwards, the box's own `discobox-access list` or the workers monitor
  tells you it landed.
- A role that keeps turning out too narrow is a change to its file in
  `roles/`, committed and pushed, not a habit of approving.

## Power

Workers sleep whenever they wait and power off when they're done (the
`worker` skill, Power). You do the parts they can't:

- **Wake a worker whose CI finished.** On a `pr.checks` completion for a
  draft PR of ours whose box isn't running, start the box and type the
  CI-done nudge ("Manager here: every check on PR <P> has finished. Finish
  your skill: evidence in the PR body, mark it ready, tag ready."). Don't wait
  for the worker's own `--wake-in`: a server restart loses it (discobox#1192;
  on 2026-11-15 four green drafts sat 90 minutes). `scripts/stuck-drafts
  --wake` does the same as a sweep on every heartbeat (`watch`).

- **Pause a box waiting on the owner.** A box tagged `needs-input` or
  `blocked` whose primary terminal has been idle for `workers.pauseAfter`
  (the `workers` monitor reports busy/idle): `discobox stop <id>`. A question
  dialog stops the agent from sleeping itself. Note the time it went idle
  when the event comes, and while any such box is pending, keep the waiting
  `pop` no longer than the time left (`watch`). The row stays "Answer in the
  box": opening it starts it again. **Never an owner's box** (`job=prototype`
  or `adhoc`): the owner drives it and it waits on them by design, so a
  pause only makes them ask for it back (owner, 2026-11-08).
- **A box you stopped that starts again is the owner** (owner, 2026-11-04):
  you didn't start it, so they opened it to work in it. Leave it running and
  never stop it again while it's in use; stop it only once its screen has
  been still for `workers.pauseAfter` after the owner's last input.
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
- **Capacity counts running workers:** power state `running` or `starting`
  only (`scripts/table slots`). Suspended, stopped and archived boxes never
  count against `workers.max` (owner, 2026-11-05). Waking one of your workers for its
  own PR comes before starting new work; at `workers.max`, it takes the next
  free slot ahead of any launch.

`discobox tag` starts a stopped box to write the tag, so a box you tag while
it sleeps is awake afterwards: stop it again if it has nothing to do.

## Rebases

Every worker comments on the PR before it starts a rebase, and again when
it has pushed (`worker` skill, Rebasing a PR; owner, 2026-11-15), so the
owner seeing a conflict knows it's being handled. The platform workers don't
read that skill: put the same instruction in any rebase job you send them.

A PR that conflicts with its base needs a rebase only if it's about to be
merged. Rebasing every conflicting PR after each merge is a rebase storm:
each rebase reruns CI, and the next merge makes most of them conflict again.

- **The merge queue** is every PR of yours that has been green and ready,
  in the table's ranked order (`table`). That includes a PR whose row shows
  some other move: a box stopped on a question ("box needs input", a
  security question) still has its PR in the queue. PR 1102 sat
  conflicting while its box waited on the owner's §9 question, because its
  row didn't say "Review and merge" (owner, 2026-11-14). A `pr.conflict`
  event on any PR of yours with a box is a rebase wake, unless the PR is
  `status/paused`. The wake asks for the rebase alone, and the question
  stays parked: `PR #<P> conflicts with <base>; rebase it (deliver-issue
  §6). Your question stays parked for the owner; don't act on it.`
- **Every PR in the queue is kept rebased** (owner, 2026-11-05; it was the
  top 3 only, and the owner kept finding conflicts lower down: they merge in
  any order). When one is `dirty`, wake its worker at once: `PR #<P>
  conflicts with <base>; rebase it (deliver-issue §6).` A rebase wakes its
  own worker even with every slot full.
- **After every merge to a watched repository's base**, recheck
  `mergeable_state` of every PR in the queue for that repository (give
  GitHub a minute: `unknown` means not yet), so a conflict is fixed before
  the owner sees it.
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
it right away, **in the same turn as the pr.merged or pr.closed event**
(whoever merged it: the owner, merge-gate or a track), without waking it to
do anything. `scripts/finished-boxes --retire` sweeps any you missed, on
every heartbeat (`watch`). To retire: **archive it**,
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
