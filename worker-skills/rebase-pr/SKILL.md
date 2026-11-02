---
name: rebase-pr
description: Rebase an open PR's branch onto its base after the base moved and the PR conflicts, keeping both sides' changes, and get it green again. Use when the manager asks a worker to rebase its PR.
---

# Rebase a PR

1. Fetch the base from the repository (not a local mirror that may be stale):
   `git fetch https://github.com/<repo>.git <base>`.
2. `git rebase FETCH_HEAD` on the PR's branch. Resolve every conflict so
   **both changes are kept**. Never drop the base's change to make yours
   apply. Re-run generators instead of hand-merging generated files.
3. Run the tests of the packages the conflict touched.
4. Push with an explicit lease on the PR's current head, and only to the PR's
   branch:
   `git push --force-with-lease=refs/heads/<branch>:<its current head on GitHub> <url> HEAD:refs/heads/<branch>`.
5. Drive CI green, tag `ready`.

**Credentials:** bound at launch, role `github-deliver` (`deliver-issue` §0). Don't request more.
