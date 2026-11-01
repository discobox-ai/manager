# State

The manager keeps no state that only it can read. A new session, or a new
manager, rebuilds the whole table from three places:

1. **GitHub.** Each open issue's `status/*` label, its linked PR, and that PR's
   checks and mergeable state.
2. **Box tags.** Each worker the manager created carries
   `issue=<repo>#<N>`, `job=<…>`, and, when its job ends, `ready`, `blocked`,
   `needs-input` or `to-delete`. List them with `discobox ls -o json`,
   filtered on `createdBySandboxId` equal to the manager's own box ID.
3. **The event queue.** `discobox-monitor` events wait until popped, so
   nothing that happened while the manager's session was down is lost
   (`.agents/skills/watch`).

Anything else (a local list of watched PRs, a "last seen" file) is a cache. Losing
it must cost nothing but a rebuild.

## Today's gap

The monitors this depends on are still landing: discobox#414 (github-repo as a
Go built-in, with PR checks by head branch, an Actions branch filter and a
conflict event) and discobox#427 (skills declaring monitors, update in place,
`test --since`, and a `discobox-box` monitor for workers). Until they land,
`reference/orchestrate.sh` shows how the old lead polled. See `docs/HANDOFF.md`.
