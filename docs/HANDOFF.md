# Handoff — 2026-11-01

This repository was drafted by the previous lead: a Claude Code session in
discobox `sbx_7gq73ma13ths3r98`, working from `/home/darren/src/disco2` (a
checkout of discobox-ai/discobox) with `orchestrate.sh` and the
`orchestrate-issues` skill from discobox-ai/skills. The owner asked for the
process to be rebuilt as an agent of its own:

> I want it so that I can talk to you and you orchestrate all work by spinning
> up boxes and follow our process. Plus you watch all github issues and PRs on
> the repos we want to watch and handle incoming work (like new issues that
> needs triage). … ignore discobox-ai/skills, we will create a new repo
> discobox-ai/manager. That repo will just be you, the agent. so AGENTS.md at
> the root, with your own skills and then a subdirectory of skills that are
> delegated to workers.

## Who is managing what right now

**The old lead (`sbx_7gq73ma13ths3r98`) still manages the workers in flight**
(the table below), until the owner says to switch. Don't approve, steer or
retire those boxes from here in the meantime, or two managers will act on one
worker. The work in this box is building the manager itself.

## Work in flight (as of the handoff)

| Item | Worker | Issue | PR | State |
|---|---|---|---|---|
| A harness is only a bundle; a box takes its kind from its pool (blocked boxd pools) | sbx_znjvkdy20k2wyd4f | discobox 426 | 429 | Green, waiting for the owner to merge |
| Monitors: skills declare monitors, `enable --update`, `test --since`, then a `discobox-box` monitor | sbx_x8myx4kmh15qn90z | discobox 427 | 428 (ADR 26-11-01-375, merged), 432 (implementation) | Implementing; `discobox-box` waits for 414 |
| `github-repo` monitor as a Go built-in, plus `head`/`author` PR checks, an Actions `branch` filter, a `pr.conflict` event | sbx_4sz2m97tdjp079z0 | discobox 414 | 431 (draft) | Working |
| disco-vm: Linux guests on vz (ADR 26-10-31-990, accepted) | sbx_fcj5ev5qg4nkcys7 | vm 27 | – | Waiting for the owner: whether to ship a default Linux base now |
| Provider credentials sealed in the provider's row | – | discobox 412 | 413 (ADR 26-10-31-694, merged as Proposed) | Waiting for the owner to say "accept 694"; gateways deferred to their own decision |
| macOS image: does it still bake in sandbox-agent? | – | discobox 126 | – | Question for the owner on the issue |

**discobox 414 and 427 are this manager's watching.** When they land, the `watch` skill's
target becomes real and nothing needs to poll.

## Direction the owner has set (discobox#42: disco-vm, macOS, provider-hosted sandboxes)

- **2026-10-12:** a boxd pool runs the ordinary Linux pool agent.
- **2026-10-15:** boxd first, disco-vm's Docker driver later. Don't refactor
  the existing Docker driver.
- **2026-10-23:** a disco-vm pool bootstraps itself from a pool-agent bundle,
  with a provisioning key (ADR 26-10-23-551). All sandbox egress goes through
  the pool proxy.
- **Issue 129:** every VM has zero egress except to the proxy and pool agent,
  which run on their own VM. **Issue 121:** macOS uids are 501 and up.
- **2026-10-31, the macOS redesign** (ADR 26-10-31-206, accepted): a local
  (vz, later hcs) pool runs the ordinary Linux pool agent and proxy in a Linux
  pool VM. The server creates and runs every VM. Sandboxes have no NIC and
  reach the pool only over vsock. macOS first, Windows later on the same
  design. disco-vm launches Linux guests beside the native OS (vm ADR 990).
  The held macOS issues were re-planned against it: #58 and #60 were closed;
  #64, #67, #68, #122 and #128 were rewritten; #423, #424 and #425 were filed.
  The summary is a comment on #42.

## Lessons behind the rules (keep them)

- **Owner preferences for the table:**
  - one table, ranked;
  - bare IDs in Agent, Issue and PR;
  - links in a list under the table;
  - "Your move" only once a PR is green;
  - re-post on every change.
- **Don't relay worker questions.** The owner answers in the box. Judge a
  worker only by the bottom of its live screen, never by scrollback.
- **Close delivered issues yourself.** CI fixes go out as PRs. Rebase before any
  push. Never merge. A relayed plan is not a go-ahead.
- **Credentials:**
  - Approve with `--secret github`; the `403 not in the sandbox role` the
    approve command prints is cosmetic, so check the request's status.
  - The GitHub judge reads a request's uses literally. Name REST paths; a
    request for "open a PR" was refused for `POST /pulls`.
  - Keep worker prompts short and task-only. The proxy judge clips them at 256
    bytes, and it reads mentions of credentials as handing out privileges.
- **The CLI inside a discobox:** the devShell can point `discobox` at a nested
  dev server. Always `export DISCOBOX_SERVER=https://api.discobox.internal`.
- **A launch error can still make a working box.** Check before launching
  again; a relaunch once put two or three workers on one issue.
- **Disk:**
  - Worker build caches fill the pool's disk. Use `docker builder prune -a -f`
    and one build at a time.
  - Stop dev image watchers a box doesn't need.
  - Check Go caches as well.
- **Watching:** start a background waiter with the Bash tool's
  `run_in_background`, never a trailing `&`. A detached one never wakes you;
  this slipped several times.
- **Flakes:** on a loaded box, tests time out. Check `/proc/loadavg` before
  blaming code. A main-CI failure that's unrelated to its commit gets one
  re-run before a fix box.

## First tasks for this repository

1. **Publish it.** The owner creates `discobox-ai/manager`, and this draft is
   pushed as its first commit (see the `github` skill).
2. **Settle how the manager's own box is made:**
   - the discobox API turned on (`discoboxApi`);
   - a `github` delegation (and any others) so it can approve workers;
   - `--no-project-skills`, so the old `orchestrate-issues` doesn't load
     beside these skills;
   - the prompt it starts with.

   Write it into AGENTS.md or a `README.md` "running the manager" section.
3. **Adapt the copied worker skills** (`worker-skills/README.md` →
   Provenance) to the contract: tags at the end, `status/*` labels, no
   AskUserQuestion for owner decisions (a `needs-input` tag instead). Write
   each skill's exact GitHub credential request into it, and teach the
   manager's `workers` skill to match against those requests. The old
   `DELIVER_ROUTES` and `TRIAGE_ROUTES` in `reference/orchestrate.sh` are the
   current wording.
4. **Label migration:** create `status/*` and `type/*` in each watched
   repository and relabel the open issues (`docs/labels.md`). That's a worker
   job, and the owner should see the plan first.
5. **Watching:** when discobox 414 and 427 merge, enable the instances in
   the `watch` skill and fix its option names to the real ones. Move this
   repository's own worker-state watcher into `.discobox/monitors/` (427 lets
   a skill declare monitors).
6. **The switch:** when the owner says so, this manager takes over the
   in-flight workers from the old lead. Tag them `manager=<this box>`, and
   the old lead stops.

## Open questions for the owner

- ~~Should triage verdicts at `priority/medium` and below go straight to
  `status/ready`?~~ Yes (2026-11-01); `docs/gates.md` updated.
- Do initiatives become milestones (`docs/labels.md`), or stay as tracker
  issues like #42?
- ~~Which repositories does the manager watch?~~ discobox, vm, manager and
  review (2026-11-01); `manager.yaml` and the `watch` skill updated.
