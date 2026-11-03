---
name: table
description: The manager's single status table for the owner — its columns, ranking and update rules. Use whenever reporting status, after any row changes, or when the owner asks where things stand.
---

# The table

Status and to-do are one table, ranked:

| # | Item | Agent | Issue | PR | Doing | Your move | Why this rank |
|---|------|-------|-------|----|-------|-----------|---------------|

- **Item** is a plain description, with no numbers in it.
- **Agent** is the worker's box ID, **Issue** and **PR** are bare numbers
  (`vm 27` for another repository). Each is `-` when it doesn't apply.
- **Doing** says what the agent is doing logically: working, waiting for you,
  waiting on CI, done. Never whether its box is running or stopped.
- **Your move** is `–` unless the owner has something to do:
  - "Review and merge", only once every check on the PR's head is green and
    the process comment for that head is posted (`github` skill).
    Never "review and merge once green".
  - "Look at it" for a failing PR its worker can't make green.
  - "Answer in the box" for a box tagged `needs-input` (or showing a question
    it didn't tag; tag it first, `workers`).
  - A concrete decision ("Say 'accept 694' …").
- **Why this rank:** rank by how much a row unblocks (critical path first),
  then by how hard the decision is to reverse.
- **Ad-hoc boxes** get a row too: Item is the owner's topic, Doing "owner
  working", Your move `–`, until `submit` gives it an issue.
- **Finished boxes** the owner should delete get one row of their own. Check
  that each still exists first.

Under the table, a plain list of links, one per line:
`- 426: https://github.com/discobox-ai/discobox/issues/426`. Never put links
inline in the table; they crowd it in a terminal.

**Re-post the table every time a row changes**, including a worker resuming
after the owner answered it. When nothing changed, say so in a line rather
than re-posting it.
