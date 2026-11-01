# discobox-ai/manager

An agent that manages engineering work across discobox-ai repositories. It
runs in a discobox and starts worker discoboxes to do the work. The owner talks
to it, and it watches GitHub, triages what comes in, runs the work through
workers, and brings the owner only what needs them.

- `AGENTS.md` (also `CLAUDE.md`): the agent itself.
- `.agents/skills/`: its own skills.
- `worker-skills/`: the skills each worker gets.
- `manager.yaml`: what it watches and its limits.
- `docs/`: gates, labels, state, and the handoff it started from.
