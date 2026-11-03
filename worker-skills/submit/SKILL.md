---
name: submit
description: Bring the work of an ad-hoc session into the process — take stock with the owner, file or find its issue, settle any design choice as an ADR, then either carry the code on to a PR in this box, park it on a pushed branch, or keep only the design. Use when the owner types "submit" (or /submit) in an ad-hoc box, or the manager types it on the owner's behalf.
allowed-tools: Bash, Read, Glob, Grep, Edit, Write, Agent, Skill, Monitor, AskUserQuestion
metadata:
  discobox.role: github-submit
---

# Submit an ad-hoc session

An ad-hoc box is one the manager started for the owner to work in by hand
(tagged `job=adhoc`). Nothing in it followed the process: a design may have
been settled in conversation, code may be half written, nothing is filed. This
skill turns whatever is here into the process's terms, so that from the end of
it on, the work is like any other: **an issue, with every PR naming it.**

It does not assume the work is finished, and often no PR comes out of it.

**Read the `worker` skill first.** It gives you `REPO` and `BASE`, your tags,
how to ask the owner, and your GitHub access (role `github-submit`). The
owner is usually at this box, and this skill asks them several things:
tag `needs-input` before each question, as `worker` says. They may have said
"submit box X" to the manager and gone elsewhere.

Invoking this skill is authorization to: file one issue in this box's
repository (or comment on an existing one), push the branch
`discobox/issue-<N>` and, only in §4's *carry on*, open a PR from it, as
`deliver-issue` describes. It is not authorization to push any other branch,
merge, close, relabel, or edit an issue's body. **Labels are the manager's**:
you propose them in §5's comment, and it applies them.

## 0. Before anything

- **The repository** is the `repo` tag (`worker`, Where you are). Missing on
  an ad-hoc box: ask the owner, and never guess from a git remote.
- **One submit per box.** An `issue` tag already set means this box has been
  submitted. Re-running is fine only to carry on what that issue says; never
  file a second issue from the same box.
- Never sit idle (`worker`, Power): when you end, power off.

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

Tag the box `issue=<N>` (`tag issue <N>`, `worker`, Tags). Name the box for it
(`worker`, Name the box). Status line: `issue <repo>#<N>`.

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

- **carry-on:** keep going as `deliver-issue`; its tags and sleeping carry on
  from here, as they do for any delivering worker.
- **parked** or **design-only:** tag the box `ready` and stop. The manager
  retires the box.

## Done when

The issue holds §5's comment, and either the box carries on as
`deliver-issue`, or it is tagged `ready` with the branch pushed (*parked*)
or nothing pushed (*design-only*). Finish with the issue URL, the outcome,
the branch and SHA if any, and the ADR if any.
