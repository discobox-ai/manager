# discobox-ai/manager

![The Rube Goldberg Factory: a crew of identical managers building an elaborate machine to make a cupcake](docs/images/manager.jpg)

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
  https://github.com/discobox-ai/manager@main -p '/start'
```

- `--discobox-api` lets it create, steer and tag its workers (only boxes it
  creates).
- `--no-project-skills` keeps the project's other skill repositories (the old
  `orchestrate-issues`) from loading beside its own.
- Its prompt runs the `start` skill, the one entry point. That first sends
  `roles/manager-request.json` (a use part for itself and a delegate part for
  its workers), which the owner approves once.
- `/start` copies the side-pane mod (`.agents/skills/start/mods/`) into the
  session; Claude Code asks once to "Turn them on".

**Starting over.** Delete every session if you like: nothing the manager
needs lives in one. Start a new session in this repository and type `/start`;
it rebuilds everything from GitHub, the box tags and
`~/.local/state/discobox-manager/`. Run it in one session only: that session
is the manager. Other sessions in the box are fine,
but don't `/start` them.

Then the owner talks to it in that box.
