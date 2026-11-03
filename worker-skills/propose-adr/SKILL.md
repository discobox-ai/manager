---
name: propose-adr
description: Draft an Architecture Decision Record as Proposed for one issue, in its own PR, and stop once that PR is green — no implementation. Use when a worker box is launched to propose the design for an issue ("ADR only").
metadata:
  discobox.role: github-deliver
---

# Propose an ADR

**Read the `worker` skill first** (`REPO`, `N`, `BASE`, tags, GitHub).

1. **Read the issue.** It names the questions the ADR must settle. Read the
   repository's ADR process (its `docs/adr/README.md` or wherever its
   `AGENTS.md`/`CLAUDE.md` points), the ADRs the issue cites, and those they
   relate to.
2. **Read the code** the decision touches, so every claim about today is
   checked against `BASE`, with file paths.
3. **Write it as `Proposed`**, with the repository's ID scheme. Answer each
   question the issue lists. Mark anything left to implementation as open,
   never decided by default. Record the alternatives you rejected and why.
   Add it to the index if the repository keeps one.
4. **One PR, the ADR alone** (and its index line), from
   `discobox/issue-N-adr`, with `open-pr`. Title `docs(adr): propose <id>,
   <the decision in a phrase>`. The body says `Part of #N`, never `Closes`.
5. **Stop** once it's green: tag `ready`. Don't implement, and don't mark it
   Accepted. The owner accepts it by merging the PR; then the manager starts
   a `deliver-issue` worker that marks it Accepted and implements it.

A question the ADR can't settle without the owner (a product or trust
choice) is asked as `worker` says, and recorded in the PR body once
answered.
