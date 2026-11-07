---
name: start
description: The manager's one entry point — start (or restart) everything from nothing: the box's name, access, this repository and the side-pane mod, then launch the loop as the background session `manager-loop` (/start-loop) and stay as `manager-chat`, the session the owner talks to. Use when the manager's box starts (its launch prompt is /start), in any new session that is to be the manager's chat, after a restart, or whenever the owner says /start.
---

# Start

The manager is two Claude sessions on this box (owner, 2026-11-04):

- **`manager-chat`**: this session, the one the owner talks to. It runs
  `/start`, holds the side pane, answers the owner, and passes what they
  decide to the loop. It never pops events or acts on them.
- **`manager-loop`**: a background session (`claude --bg`) running
  `/start-loop`: watching, the table, the workers, every event.
  Not a subagent: it outlives this session and its 30-minute monitors.

Everything either needs is in GitHub, on its boxes' tags and in
`~/.local/state/discobox-manager/` (`docs/state.md`); nothing from an earlier
session is assumed, so the owner can delete every session and start a new one
with `/start`. Safe to run again at any time: every step checks before it acts.

**One chat, one loop.** `claude agents --json` lists the live sessions with
their names. Another interactive session already acting as `manager-chat`:
say so in one line and stop unless the owner says this one replaces it.

```sh
eval "$(discobox-access env)"   # GH_TOKEN; leave the DISCOBOX_* environment as it is
```

## 0. Name the box

Discobox lists this box by `~/.discobox/meta.json`'s `name`, and with none, by
whichever session's title it last saw. Make it the manager's, keeping any
fields already there:

```sh
python3 - <<'PY'
import json, os
p = os.path.expanduser("~/.discobox/meta.json")
try:
    m = json.load(open(p))
except (OSError, ValueError):
    m = {}
m["name"] = "Discobox manager"
m.setdefault("description", "The manager: watches discobox-ai's repositories, runs workers, keeps the status table.\nStart with /start.")
m.setdefault("tags", {})["manager"] = ""
text = json.dumps(m, indent=2)
open(p, "w").write(text)
PY
jq . ~/.discobox/meta.json
```

Never give it a `job` tag: that marks a worker (`AGENTS.md`). The session's
own name is the owner's to set (`/rename`, which only they can type); §5
asks for `manager-chat`.

## 1. Access

`discobox-access list` must show both:

- a credential in `GH_TOKEN` reaching `api.github.com`, your own use;
- exactly one credential you may delegate reaching `api.github.com`, what you
  bind workers from.

Go by the variable and the hosts, not the name: the owner chooses which
secret to grant, and it may not be called `github` (`workers`, Launch, reads
the delegated one's name).

If either is missing, or `roles/manager-request.json` changed since it was
approved (a repository or role was added), send it from this repository's
root and wait for the owner (`roles/README.md`):

```sh
discobox-access request --json < roles/manager-request.json
```

Run it in the background and keep its request ID. Say in one line that
you're waiting for the owner to approve it, and go no further until both
parts are approved. A denied part: say what it stops you doing, and stop.

Then check `discobox ls -o json` works (the discobox API). Refused means the
box was started without `--discobox-api`: tell the owner, and stop.

## 2. This repository

`git status` clean, and `HEAD` equal to `main` on GitHub (`github` skill,
Pushing to discobox-ai/manager). Pull if GitHub is ahead. Workers install
their skills from the pushed `main`. Changes another session left uncommitted
are that session's: say so, and don't commit them for it.

## 3. The side pane

The table's side pane is the `manager-table` mod, kept in this skill's
`mods/` folder (the repository is its home: edit it there). A session loads
a mod only from its own mods folder, so each new manager session gets a copy:

1. Load the `plugin-authoring` skill (Skill tool). It names this session's
   mods folder (`~/.claude/dev-mods/<this session's id>/`).
2. Copy each folder in `.agents/skills/start/mods/` into it, unless an
   identical copy is there (`diff -r`), e.g.
   `cp -r .agents/skills/start/mods/manager-table <mods folder>/`.
3. Claude Code asks the owner, once per session, "Turn on the mods Claude
   writes in this session?" Say in one line that the table pane needs
   "Turn them on". After that the session loads it on every resume.

The pane opens by itself only in a terminal at least 144 columns wide;
`/table-pane` opens it at any width. It is the owner's only view of the
table: there is no site or artifact (owner, 2026-11-07).

## 4. The loop

Launch `manager-loop` unless it is already running:

```sh
claude agents --json | jq -r '.[] | select(.name=="manager-loop") | "\(.id) \(.status)"'
```

- **None:** launch it from this repository's root, and keep the id it prints:

  ```sh
  cd /workspace/manager && claude --bg -n manager-loop \
    --permission-mode bypassPermissions "/start-loop"
  ```

- **One, live:** leave it. It is the loop; don't start a second.
- **One, but stuck or from before a change to `start-loop`** and the owner
  wants it replaced: `claude stop <id>`, then launch as above. A stopped loop
  keeps its conversation (`claude attach <id>`).

`claude logs manager-loop` shows its recent output; `claude attach
manager-loop` opens it for the owner. It sends you one line when it's up.

## 5. Chat

Say one line to the owner: started, the loop's id, what §1–§3 need from them
(an approval, "Turn them on" for the side pane), and, when this session isn't
named yet, that `/rename manager-chat` names it so the loop can reach it.

From then on, in this session:

- **The owner decides something** (start, stop, a priority, an answer about
  an issue): pass it to `manager-loop` with SendMessage, quoting the owner's
  own words, and say in one line that you have. The loop acts on it by the
  gates. Its reply comes back to you; relay what matters.
- **The owner asks where things stand:** read the table (`scripts/table
  show`), GitHub and the boxes yourself; ask the loop only for what isn't
  there.
- **The owner changes the process:** edit this repository and push it
  (`github` skill, Pushing to discobox-ai/manager), then tell the loop what
  changed, so it reloads the skill (and restart it, §4, if `start-loop`
  itself changed and the owner agrees).
- **"Stop the loop":** `claude stop <id>` for `manager-loop`, nothing else.
  Boxes and monitors are left as they are; events queue until a
  loop starts again.
- Never `discobox-monitor pop`, start a Monitor on the queue, or act on
  a worker yourself: that is the loop's, and two of you acting answers
  everything twice.
