# discobox-ai/manager

An agent that manages engineering work across discobox-ai repositories. It
runs in a discobox and starts worker discoboxes to do the work. The owner talks
to it, and it watches GitHub, triages what comes in, runs the work through
workers, and brings the owner only what needs them.

- `AGENTS.md` (also `CLAUDE.md`): the agent itself.
- `.agents/skills/`: its own skills.
- `worker-skills/`: the skills each worker gets.
- `manager.yaml`: what it watches and its limits.
- `roles/`: the GitHub credential policies the manager and its workers are bound.
- `docs/`: gates, labels, state, and the handoff it started from.

## Running the manager

The owner starts the manager's box once, from this repository:

```sh
discobox run -d --discobox-api --no-project-skills \
  https://github.com/discobox-ai/manager@main -p 'You are the manager. Start the loop.'
```

- `--discobox-api` lets it create, steer and tag its workers (only boxes it
  creates).
- `--no-project-skills` keeps the project's other skill repositories (the old
  `orchestrate-issues`) from loading beside its own.
- It starts with no GitHub access. Its first step sends
  `roles/manager-request.json`: a use part for itself and a delegate part for
  its workers. The owner approves both parts once.

Then the owner talks to it in that box.
