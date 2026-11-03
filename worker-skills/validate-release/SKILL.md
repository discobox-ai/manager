---
name: validate-release
description: Validate a discobox release in an empty (no-source) box, from the release site only — either a fresh install of one release, or an install of an older release, seeded with harnesses, pools (libkrun, container) and boxes, then upgraded to the new one. Records the onboarding experience step by step and compares it with the last recorded run, judging each difference against the release's changes. Reports one verdict comment on the release's tracking issue. Use when a worker box is launched to validate a release.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Agent, Skill, Monitor, AskUserQuestion
metadata:
  discobox.role: github-triage
  argument-hint: "fresh <to> | upgrade <from> <to>   (e.g. upgrade v0.17.0 v0.18.0)"
---

# Validate a release

You are in an **empty box** (`--no-source`): nothing is checked out, and
nothing of discobox is installed. You install it the way a user does, from the
release site, and check that it installs, onboards, and (in `upgrade` mode)
upgrades cleanly with real state in it. You never build discobox from source,
and you never fix anything: what you find goes in the report, and new work as
an "Issue to file" (`worker`).

Your tags give the tracking issue (`repo`, `issue`); your prompt gives the
mode and versions. Follow the `worker` skill for tags, power and comments.

## 0. The baseline

The last accepted onboarding record for your mode is kept in
discobox-ai/manager (`release-validation/onboarding-<mode>.md`), which your
role can't read. The manager posts it on your tracking issue before it starts
you, as a comment headed `**Release validation baseline** (<mode>)`:

```sh
gh api "repos/$REPO/issues/$ISSUE/comments?per_page=100" \
  --jq '[.[] | select(.body | startswith("**Release validation baseline** (<mode>)"))][-1].body' > ~/baseline.md
# empty: no baseline yet, this run makes the first
```

Read it before you start: it tells you what the experience was last time, so
you notice what changed as it happens.

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

## 3. Seed (upgrade mode only)

On `<from>`, make the state an upgrade must keep:

- **Harnesses:** configure at least `claude-code` and one other the release
  offers (config only; no login).
- **Pools:** a **container** pool and a **libkrun** pool. libkrun needs
  `/dev/kvm`: if it's missing in this box, record "libkrun: skipped, no
  /dev/kvm" and go on.
- **Boxes:** one in each pool. In each, write a marker into its data
  (`/.discobox/data/validate-<from>.txt` with a random value you keep) and
  into its working tree, then stop one and leave one running.

Record every command and its result in `~/seed.md`.

## 4. Upgrade (upgrade mode only)

Upgrade the way a user does, from the release site:
`curl -sSfL https://discobox.ai | sh -s -- --version <to>` (and, if the
release documents another upgrade path, such as `discobox upgrade`, that
too, in a second pass on fresh state). Keep the output. Any onboarding or
migration prompt the upgrade shows goes into the record (§2), under
"Upgrade".

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

## 7. Report

One comment on the tracking issue (your `issue` tag), in this form:

```markdown
**Release validation** — <mode> <from →> <to>: PASS | FAIL

| Check | Result | Evidence |
|---|---|---|
| ... | PASS | ... |

### Onboarding compared with the last run
- Step 3 (Choose a pool): wording changed — expected, #498. ...
- No baseline: this run sets the first.

### Findings
(none) | each one, with an **Issue to file** comment posted separately (`worker`)

<details><summary>New onboarding record (onboarding-<mode>.md)</summary>

...the whole file...

</details>
```

then the footer. The manager commits the record as the new baseline once the
owner accepts the run. Tag `ready` and power off (`worker`, Power).

## Done when

The report comment is on the tracking issue, with every §5 check answered,
every onboarding difference judged, the new record attached, and each
finding posted as an Issue to file.
