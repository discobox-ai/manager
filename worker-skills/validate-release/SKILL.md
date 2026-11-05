---
name: validate-release
description: Validate a discobox release in an empty (no-source) box, from the release site only — either a fresh install of one release, or an install of an older release, seeded with harnesses, pools (libkrun, container) and boxes, then upgraded to the new one. Records the onboarding experience step by step and compares it with the last recorded run, judging each difference against the release's changes. Reports one verdict comment on the release's tracking issue. Use when a worker box is launched to validate a release.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Agent, Skill, Monitor, AskUserQuestion
metadata:
  discobox.role: github-deliver
  argument-hint: "fresh <to> | upgrade <from> <to>   (e.g. upgrade v0.17.0 v0.18.0)"
---

# Validate a release

Your box starts **empty**. First clone **discobox-ai/release-validation**
(your role reaches it; the manager's doesn't): its notes skill, its baselines
and a flake of host prerequisites, and nothing of discobox itself. Work from
that checkout. Nothing of discobox is installed.

```sh
FORK=$(jq -r '.tags.fork // empty' ~/.discobox/meta.json)
git -c credential.helper= -c credential.helper='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f' \
  clone https://github.com/discobox-ai/release-validation.git ~/release-validation && cd ~/release-validation
``` You install it the way a user does, from the
release site, and check that it installs, onboards, and (in `upgrade` mode)
upgrades cleanly with real state in it. You never build discobox from source,
and you never fix anything (a workaround only when told: §4b): what you find goes in the report, and new work as
an "Issue to file" (`worker`).

Your tags give the tracking issue (`repo`, `issue`); your prompt gives the
mode and versions. Follow the `worker` skill for tags, power and comments.

## 0. The notes and the baseline

Read, from that checkout, before anything else (the notes skill is at
`.agents/skills/validate-release-notes/SKILL.md`):

- the **`validate-release-notes`** skill: checks carried forward from past
  findings (run each, report each on its own line), recipes that worked,
  environment quirks, and differences already explained;
- **`baselines/onboarding-<mode>.md`**: the last accepted onboarding record.
  Missing: this run sets the first.

For libkrun pools, the repo's flake holds the host prerequisites a user is
expected to install (`nix develop` gives `LD_LIBRARY_PATH` with
`libkrun.so.1`, and `passt`). Run the libkrun checks inside it, and run a
`fresh` install once **without** it too, to see what onboarding tells a user
who hasn't installed them.

## 1. Install (from the release site only)

```sh
curl -sSfL https://discobox.ai | sh -s -- --version <version>
```

`<version>` is `<to>` for `fresh`, `<from>` for `upgrade`. Never install from
a checkout, a CI artifact or a local build. Keep the installer's whole output.
If discobox.ai fails, try once with
`DISCOBOX_INSTALL_SOURCES=https://github.com/discobox-ai/discobox/releases/download`
and record that the primary site failed (that's a finding).

Check: `discobox --version` names the version; the server it starts (or the
installer started) answers.

## 2. Onboard, and record it

Go through first run the way a new user would: run `discobox` with no
arguments and follow what it asks, accepting defaults unless a step needs a
choice (then take the choice the baseline took, or the first option).

Drive interactive screens in `tmux` so you can see them: start
`tmux new -d -s ob -x 160 -y 48 'discobox'`, read with `tmux capture-pane -p -t ob`,
answer with `tmux send-keys -t ob ... Enter`.

Write `~/onboarding-<mode>.md` as you go, one numbered step per screen or
prompt:

```markdown
### 3. Choose a pool
**Shown:** the prompt's text, and its options (as listed)
**Did:** the answer given
**Result:** what happened next (a line of output, the next screen)
```

Normalize what changes run to run, so the record diffs cleanly: versions →
`<version>`, box and pool IDs → `<id>`, times and durations → `<time>`, paths
under `$HOME` → `~`. Keep wording exactly otherwise: a changed word is what
the comparison is for.

Steps that need a person's credential (a harness login): record the prompt,
choose the option that skips or defers it, and note it. Don't ask for
credentials.

## 2b. Startup latency

The owner wants to know how long a user waits to start (owner, 2026-11-05).
Measure it, in both modes, on `<to>`: in `fresh` right after install, in
`upgrade` right after §4. Use a fresh local user with an empty `HOME` and no
`DISCOBOX_*` variables (§3), so the CLI starts its own server and nothing is
cached. Drive it in tmux, timestamping with `date +%s.%N`:

```sh
tmux new -d -s lat -x 160 -y 48
T0=$(date +%s.%N); tmux send-keys -t lat 'discobox run --no-source -H claude-code' Enter
```

Poll `tmux capture-pane -p -t lat` (every 0.25 s) and the server
(`discobox ls` answering, or its log), and record when each milestone first
happens:

| Mark | When |
|---|---|
| **T1 server up** | the server is downloaded (if the CLI fetches it) and answers |
| **T2 box running** | the box is listed as running |
| **T3 harness screen** | Claude Code's first screen is drawn in the terminal (its welcome, theme or login screen: whatever comes first; no login, no completions) |

Run it **three times**: the first cold (nothing downloaded: no server, no
images, no harness bundle), then twice warm (`discobox rm` the box between
runs; keep the server running for one warm run, and stop it for the other).
Note where the time goes when the CLI or log says (downloading the server,
pulling an image, the harness bundle, the VM boot), and the pool type used.

Report a table in seconds (T1, T2−T1, T3−T2, T3 total) for each run, the
box's CPU count and whether `/dev/kvm` is there: this runs nested inside a
discobox, so say so next to the numbers. Keep the raw timestamps in
`~/latency.md`, and add it to the run PR as `baselines/latency-<mode>.md`, so
the next release compares against it.

**The 25% rule** (owner, 2026-11-05): compare each run's T3 total (cold with
cold, warm with warm) with `baselines/latency-<mode>.md`. More than 25% slower
is a FAIL on the §5 latency check and a finding (an "Issue to file", with
both tables). No baseline yet: this run sets it, and the check is SKIP.

## 3. Seed (upgrade mode only)

On `<from>`, make the state an upgrade must keep:

- **Harnesses:** set `claude-code` as the project default, and configure one
  other the release offers that needs no login (e.g. opencode), adding a file
  to it. claude-code can't reach `configured` without a login: that's expected.
- **Pools:** a **container** pool and a **libkrun** pool. libkrun needs
  `/dev/kvm`: if it's missing in this box, record "libkrun: skipped, no
  /dev/kvm" and go on.
- **Boxes:** one in each pool. In each, write a marker into its data
  (`sudo` to write `/.discobox/data/validate-<from>.txt`, root-owned by design, with a random value you keep) and
  into its working tree, then stop one and leave one running.
- Run as a fresh local user with an empty `HOME` and no `DISCOBOX_*`
  variables: inside a discobox the CLI otherwise talks to the host's server.

Record every command and its result in `~/seed.md`.

## 4. Upgrade (upgrade mode only)

Upgrade the way a user does, from the release site:
`curl -sSfL https://discobox.ai | sh -s -- --version <to>` (and, if the
release documents another upgrade path, such as `discobox upgrade`, that
too, in a second pass on fresh state). Keep the output. Any onboarding or
migration prompt the upgrade shows goes into the record (§2), under
"Upgrade".

## 4b. A workaround, only when you're told

A failure that stops the run (the upgraded CLI refuses to start, say) ends
the checks after it: they're SKIP. You never work around it on your own. If
the owner or the user tells you to (directly, or through the manager), apply
exactly that workaround and carry on, and **mark everything after it**
(owner, 2026-11-05):

- In your record, a step `Workaround (told by <who>): <exact command>`, for
  `<issue>`.
- In the report, a `### Caveats` section listing each workaround, its issue,
  and which checks ran after it. Each such check's Evidence starts
  `After the <issue> workaround:`.
- In **every** Issue to file (and evidence added to an existing issue) found
  after it, a first line: `Caveat: found after working around <issue> by hand
  (<exact command>); without it the run stopped at <step>.`
- For the blocking issue itself, a comment saying the workaround was used and
  what it let through. It's in discobox-ai/discobox, which your role can't
  reach: post it on your tracking issue as **Comment for <repo>#<N>**, and the
  manager posts it there. Never ask for a credential to post it.

The verdict stays FAIL for the blocker: a workaround never turns it into a
PASS.

## 5. Check

Each a line in the report, PASS / FAIL / SKIP with the evidence:

- `discobox --version` is `<to>`; the server answers and reports `<to>`.
- (upgrade) Every harness, pool and box from §3 is still listed, with its
  settings. The stopped box starts; the running one is still reachable
  (`discobox shell <box> -- cat /.discobox/data/validate-<from>.txt` gives the
  marker); working trees kept.
- A **new** box starts in each pool and runs a shell command.
- `discobox doctor` (or the release's health command) is clean.
- Nothing in the server's log at error level that the release doesn't explain.
- Startup latency (§2b): each T3 total within 25% of the baseline's.

## 6. Compare with the baseline

Diff your record against `~/baseline.md`, step by step. For each
difference, find whether the release meant it: read the changes between the
two versions

```sh
gh api repos/discobox-ai/discobox/compare/<previous>...<to> --jq '.commits[].commit.message' | head -200
gh release view <to> -R discobox-ai/discobox
```

and judge it:

- **Expected:** a change in the release explains it. Name the PR or commit.
- **Unexplained:** nothing does. That's a finding: an "Issue to file" (§7),
  unless it's clearly cosmetic and harmless (say so).

No baseline: say this run sets the first one.

## 7. Report, and update what the next run reads

1. **One PR to discobox-ai/release-validation** (from your fork, `open-pr`
   for the form), from branch `validate/<mode>-<to>`, holding:
   - your record as `baselines/onboarding-<mode>.md`;
   - your timings as `baselines/latency-<mode>.md` (§2b);
   - in the notes skill, under "Checks carried forward", the line
     "Startup latency: T3 totals within 25% of `baselines/latency-<mode>.md`
     (owner, 2026-11-05)" if it isn't there yet;
   - edits to the notes skill, **only** where it steered you wrong, or where a
     finding deserves a check next release (add it under "Checks carried
     forward", naming the issue), or a check's issue is closed and it passed
     here (drop it, saying so). Never rewrite it for style; never put method
     there (that belongs in this skill).
   Merging that PR is the owner accepting the run.
2. **One report comment on your tracking issue** (your `issue` tag, in
   discobox-ai/release-validation), in this form:

```markdown
**Release validation** — <mode> <from →> <to>: PASS | FAIL

| Check | Result | Evidence |
|---|---|---|
| ... | PASS | ... |
| (each carried-forward check) | ... | ... |

### Startup latency (§2b): PASS | FAIL | SKIP (first baseline)
<pool type, CPUs, /dev/kvm yes|no, nested in a discobox>

| Run | T1 server | T2−T1 box | T3−T2 harness | Total | Baseline total | Change |
|---|---|---|---|---|---|---|
| cold | | | | | | +x% |
| warm, server running | | | | | | |
| warm, server stopped | | | | | | |

Where the cold time went: <download server, image pull, harness bundle, boot>.

### Onboarding compared with the baseline
- Step 3 (Choose a pool): wording changed — expected, discobox-ai/discobox#498 (always the full `discobox-ai/discobox#N`: this report is posted in release-validation, where a bare `#N` links to the wrong repository). ...

### Caveats
(none) | each workaround (§4b): who told you, the exact command, its issue, the checks that ran after it

### Findings
(none) | each one, with an **Issue to file** comment posted separately (`worker`), for discobox-ai/discobox

Run PR: #<P> (new baseline and note edits)
```

then the footer. Tag `ready` and power off (`worker`, Power).

## Done when

The run PR is open with the new record and any note edits, and the report
comment is on the tracking issue: every §5 and carried-forward check
answered, every onboarding difference judged, each finding posted as an Issue
to file.
