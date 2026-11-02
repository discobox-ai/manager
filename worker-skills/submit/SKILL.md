---
name: submit
description: Bring the work of an ad-hoc session into the process — take stock with the owner, file or find its issue, settle any design choice as an ADR, then either carry the code on to a PR in this box, park it on a pushed branch, or keep only the design. Use when the owner types "submit" (or /submit) in an ad-hoc box, or the manager types it on the owner's behalf.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Agent, Skill, Monitor, AskUserQuestion
---

# Submit an ad-hoc session

An ad-hoc box is one the manager started for the owner to work in by hand
(tagged `job=adhoc`). Nothing in it followed the process: a design may have
been settled in conversation, code may be half written, nothing is filed. This
skill turns whatever is here into the process's terms, so that from the end of
it on, the work is like any other: **an issue, with every PR naming it.**

It does not assume the work is finished, and often no PR comes out of it.

The owner is usually at this box, so this is the one skill that asks the owner
directly. Every time you ask, tag the box `needs-input` first and drop it once
answered (§6): the owner may have said "submit box X" to the manager and gone
elsewhere, and the tag is how the manager knows to put "Answer in the box" on
its table.

Invoking this skill is authorization to: file one issue in this box's
repository (or comment on an existing one), push the branch
`discobox/issue-<N>` and, only in §4's *carry on*, open a PR from it, as
`deliver-issue` describes. It is not authorization to push any other branch,
merge, close, relabel, or edit an issue's body. **Labels are the manager's**:
you propose them in §5's comment, and it applies them.

## 0. Before anything

- **Which repository.** The box's `repo` tag (`jq -r .tags.repo
  ~/.discobox/meta.json`), set by the manager at launch. If it is missing,
  ask the owner; never guess from a remote URL, which may be the box's own git
  origin, not GitHub.
- **One submit per box.** An `issue` tag already set means this box has been
  submitted. Re-running is fine only to carry on what that issue says; never
  file a second issue from the same box.
- **Ask for GitHub now, in one request**, unless `discobox-access list`
  already shows `GH_TOKEN` sent to `github.com`. Fill in `<repo>` and change
  nothing else: the manager approves only this exact ask, and it covers every
  path in §4 so nobody is asked again mid-run:

  ```bash
  discobox-access request --json <<'EOF'
  {
    "name": "github",
    "envVar": "GH_TOKEN",
    "routes": [
      "github.com/<repo>.git/**,/<repo>/**",
      "GET api.github.com/repos/<repo>/**",
      "GET api.github.com/search/issues",
      "api.github.com/graphql graphql=query",
      "api.github.com/graphql graphql=mutation:markPullRequestReadyForReview",
      "POST api.github.com/repos/<repo>/issues",
      "POST api.github.com/repos/<repo>/issues/*/comments",
      "POST api.github.com/repos/<repo>/pulls",
      "PATCH api.github.com/repos/<repo>/pulls/*",
      "POST api.github.com/repos/<repo>/pulls/*/comments/*/replies",
      "POST api.github.com/repos/<repo>/actions/runs/*/rerun-failed-jobs"
    ],
    "justification": "I am filing the owner's ad-hoc work in <repo> as an issue, pushing it on branch discobox/issue-<N>, and if asked carrying it to a pull request into the default branch. I will not push any other branch, merge, close, relabel, or touch workflows or secrets.",
    "grantTTLSeconds": 259200,
    "wait": true
  }
  EOF
  ```

  Run it in the background and keep its request ID (`discobox-access wait
  --json request <id>` resumes it). A `route:` refusal (`discobox-access audit
  --blocked`) means the step is outside what was approved: stop and say so.
- **Hold the box up** while you work: `touch -d '+2 hours'
  /run/discobox/keepalive/submit`; `rm` it when you finish.

Status line: `submitting: <repo>`.

## 1. Take stock

Read back the conversation and the working tree (`git status`, `git diff`
against the default branch, `git log` of anything committed here), then run
the tests of what was touched. Tell the owner, in at most ten lines:

- **Decided:** each design choice the conversation settled, and the
  alternative it rejected.
- **Built:** what the code does now.
- **Missing:** what the work needs before it's done, including tests and
  docs.
- **State:** builds or not, tests pass or fail (name them).

Ask the owner to correct it (`AskUserQuestion`: "Right as written" /
"Corrections"). Everything after this is built from the corrected version, so
get it right here.

Status line: `stock taken: <one line>`.

## 2. The issue

Search first: `gh api 'search/issues?q=repo:<repo>+is:issue+is:open+<terms>'`.

- **One already covers it:** confirm with the owner. Then add what the session
  decided and built as a comment on it. Don't edit its body. Its number is
  `<N>`.
- **None does:** file one with `gh api -X POST repos/<repo>/issues`. Write it
  so a worker who never saw this conversation can carry on from it alone:

  ```markdown
  ## Today
  What the code does now, with file paths, before this work.

  ## Wanted
  What the session decided, each choice with the alternative it rejected.

  ## Done when
  The whole job, not only what is built: behaviour, tests, docs.

  ## Where it stands
  Filled in by §5's comment.
  ```

  Title it as the change, not the session ("github-repo polls with
  conditional requests", not "ad-hoc work"). If the work is part of a
  tracking issue, say `Part of <repo>#<T>` at the top.

Tag the box `issue=<repo>#<N>` (§6). Status line: `issue <repo>#<N>`.

## 3. The design gate

If the session settled a design choice with a plausible alternative, it
needs an ADR. Follow the repository's ADR process and `propose-adr` §§1–3 for
the form: Context from the code, the decision, and the rejected alternatives,
taken from §1's **Decided**. Then ask the owner: "Accept ADR <id> as
written?"

- **Accepted:** write it with Status `Accepted`, and a line under its date:
  `Accepted by the owner in an ad-hoc session, <date>`. It travels with the
  code, in §4's PR or parked branch.
- **Not yet:** write it as `Proposed`, commit it on its own, and open it as
  its own PR (`propose-adr` §4) from `discobox/issue-<N>-adr`. The code can't
  go further than a parked branch (§4) until the owner says "accept".

No design choice, or only obvious ones: no ADR. Say which in §5.

Status line: `adr: <id> accepted | <id> proposed in #<P> | none`.

## 4. The code

Ask the owner which of three it is (`AskUserQuestion`), recommending one:

- **Carry on here.** Finish it in this box, unattended if the owner leaves:
  run `deliver-issue` from its §1 (Implement) with `<N>`, through review,
  verify, the PR and keeping it mergeable until merged. Not open to a
  Proposed ADR from §3.
- **Park it.** The work stays for later, or waits on a Proposed ADR, or the
  owner wants a fresh worker on it. Commit the work in progress as it is
  (`commit` skill wording, `wip:` prefix if it doesn't build), push it to
  `discobox/issue-<N>`, and open no PR. The next worker starts from that
  branch.
- **Design only.** The code was a sketch, and only what it taught is kept, in
  the issue and the ADR. Push nothing.

Recommend *carry on* when the work is close and nothing waits on the owner;
*park* when a Proposed ADR blocks it or a lot remains; *design only* when the
code would mislead a worker more than help.

Status line: `code: carry-on | parked at <sha> | design-only`.

## 5. Hand it over

Post one comment on the issue, in this form exactly. The manager reads it to
set the issue's labels and decide what happens next, and a fresh session of
the manager rebuilds from it:

```markdown
**Submitted from an ad-hoc session** (box `<box id>`)

- **Outcome:** carry-on | parked | design-only
- **Branch:** `discobox/issue-<N>` at `<sha>` | none
- **ADR:** <id>, accepted in session | <id>, Proposed in #<P> | none
- **Proposed labels:** type/<…>, priority/<…>, area/<…>

### Where it stands
What is built and what state it is in (build, tests).

### What's left
The rest of `## Done when`, as a list a worker can start from.
```

Status line: `submitted: <repo>#<N>, <outcome>`.

Then:

- **carry-on:** keep going as `deliver-issue`; its tags (`ready`, `blocked`,
  `merged`) carry on from here, as they do for any delivering worker.
- **parked** or **design-only:** tag the box `ready` (§6) and stop. The
  manager retires the box.

## 6. Tags

The box's tags in `~/.discobox/meta.json` are how the manager knows where
this box stands. Merge a tag in without dropping the others, and keep at most
one of `ready`, `blocked`, `needs-input`:

```bash
S=<scratchpad>; M=~/.discobox/meta.json
# set <k> to <v>; for a state tag (ready, blocked, needs-input) <v> is "" and the other two are dropped
{ cat $M 2>/dev/null || echo '{}'; } | jq --arg k '<k>' --arg v '<v>' '
  .tags = (.tags // {})
  | if ($k | IN("ready","blocked","needs-input")) then .tags |= del(.ready, .blocked, ."needs-input") else . end
  | .tags[$k] = $v' > $S/meta.json &&
  jq -e '(.tags | length) <= 64' $S/meta.json >/dev/null && cp $S/meta.json $M
# drop the state tag once answered
{ cat $M; } | jq '.tags |= del(."needs-input")' > $S/meta.json && cp $S/meta.json $M
```

- `needs-input` while a question to the owner is open, and only then.
- `issue=<repo>#<N>` from §2 on.
- `ready` at the end of *parked* or *design-only*.

## Done when

The issue holds §5's comment, and either the box carries on as
`deliver-issue`, or it is tagged `ready` with the branch pushed (*parked*)
or nothing pushed (*design-only*). Finish with the issue URL, the outcome,
the branch and SHA if any, and the ADR if any.
