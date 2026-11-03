# State

The manager keeps no state that only it can read. A new session, or a new
manager, rebuilds the whole table from three places:

1. **GitHub.** Each open issue's `status/*` label, its linked PR, and that PR's
   checks and mergeable state.
2. **Box tags.** Each worker the manager created carries
   `repo=<owner>/<name>`, `issue=<N>`, `job=<…>`, `pr=<P>`, and a state tag:
   `needs-input`, `blocked`, `ready` or `merged`, and `to-delete` once
   retired (the `worker` worker skill defines them). List them with `discobox ls -o json`,
   filtered on `createdBySandboxId` equal to the manager's own box ID.
3. **The event queue.** `discobox-monitor` events wait until popped, so
   nothing that happened while the manager's session was down is lost
   (`.agents/skills/watch`).

Anything else (a local list of watched PRs, a "last seen" file) is a cache. Losing
it must cost nothing but a rebuild.
