---
name: fix-ci
description: Make a red CI green — a PR's or the default branch's — by finding and fixing the cause, delivered as a PR. Use when a worker is launched to fix failing CI or a flaky test.
metadata:
  discobox.role: github-deliver
---

# Fix CI

1. **Find the failing run and job.** For the default branch:
   `gh run list -R <repo> --branch main --status failure`.
   Then `gh run view <id> --log-failed`.
2. **Decide: flake or real.** A failure unrelated to the commit's files, that
   passes on re-run, is a flake. A flake still gets fixed (it costs everyone
   re-runs), but say in the PR that it was one.
3. **Reproduce before fixing.** Run the failing test locally, under `-race`,
   repeated (`-count=N`), and under load if it's timing-sensitive. Check
   `/proc/loadavg` first: on a loaded box, tests time out spuriously.
4. **Fix the cause**, in the code if the race is real. **Never** lengthen a
   timeout or retry an assertion to hide it.
5. **Deliver as a PR** (`open-pr`), even for the default branch's CI. Never
   a local commit or a push to main. The PR names the cause and the
   reproduction that showed it.
6. Drive it green, tag `ready`.

**Credentials:** bound at launch, role `github-deliver` (`deliver-issue` §0), and a one-off beyond it is asked for as that section says.
