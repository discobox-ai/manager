---
name: propose-adr
description: Draft an Architecture Decision Record as Proposed for one issue, in its own PR, and stop once that PR is green — no implementation. Use when a worker is launched with "ADR only" or to propose the design for an issue.
---

# Propose an ADR

1. **Read the issue.** It names the questions the ADR must settle. Read the
   repository's ADR process (`docs/adr/README.md`, `AGENTS.md`/`CLAUDE.md`)
   and the ADRs the issue cites, and those they relate to.
2. **Read the code** the decision touches, so every "today" claim in the ADR
   is checked against the default branch, with file paths.
3. **Write it as `Proposed`**, with the ID scheme the repository uses (in
   discobox: `YY-MM-DD-RRR`, three random digits, never "the next number").
   Answer each question the issue lists. Mark anything you leave to
   implementation as open, never decided by default. Record the alternatives
   you rejected and why. Add it to the index if the repository keeps one.
4. **One PR, the ADR alone** (and its index line). Title
   `docs(adr): propose <id>, <the decision in a phrase>`. Body says
   `Part of #N`. Drive its checks green.
5. **Stop.** Tag your box `ready`. Don't implement, and don't mark the ADR
   Accepted. The owner accepts it; when they do, the manager starts a worker
   for a follow-up PR that marks it Accepted (and marks what it supersedes,
   per the repository's process).
6. If a question can't be settled without the owner (a product or trust
   choice), ask it in your terminal, put it in a comment on the PR, and tag
   `needs-input`.

**Credentials:** the same GitHub request as `deliver-issue`.
