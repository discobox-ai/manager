# Reference

What the previous lead ran, kept as a source of working commands while this
repository's skills replace it. Nothing here is loaded as a skill.

- `orchestrate.sh`: the old lead's script, as it ran on 2026-11-01. It has
  working forms of `approve` (matching a worker's GitHub request against
  `DELIVER_ROUTES`/`TRIAGE_ROUTES`), `idle` (reading a worker's terminal title
  and screen), `firstrun`, `kick`, `retire`, `rebase` and `say`. Its `watch`
  polls and exits on any change, which is what monitors replace.
- `orchestrate-issues-skill/`: the old lead's skill from discobox-ai/skills
  at 5676735. Its process is superseded by `AGENTS.md`; its details
  (capacity, credential wording, the after-merge sequence) are worth mining.
