---
name: validate-main-install
description: Check that the newest main build (the `main` channel, released into discobox-ai/discobox-main) downloads and installs, on a clean user, by the documented installer. Only that it installs and starts, not a full release validation. Files a discobox issue when it doesn't. Use when the manager starts a box with /validate-main-install <tag>.
allowed-tools: Bash, Read, Skill
metadata:
  discobox.role: github-triage
  argument-hint: "<main build tag, e.g. v0.19.7-main.3216.gc51a75e>"
---

# Validate a main build installs

The owner (2026-11-18): "we have main releases building now, can we spin up a
validation box to main sure the main releases actually download and install
properly. we should test the install of main release hourly if anything has
changed. just that they install."

`TAG` is the prompt's argument: the main build to check. Read the `worker`
skill for tags and power. This job has no PR; it reports on GitHub only when
something is wrong.

## 0. Wait for a quiet host

The owner (2026-11-20): "add a rule to the main test that it will wait until
it sees a loadavg that less than the number of cpus/threads? And then run the
test again." An install on a busy host measures the host, not the build
(discobox#1513: a 99 MiB download reached 29 MiB while load was 85).

- Read `/proc/loadavg`'s 1-minute figure and `nproc`. **Start only when the
  1-minute load is below `nproc`**, and stays below it for two readings a
  minute apart. Otherwise sleep a minute (`worker`, Power: a short sleep
  with a wake, or `sleep 60` here, since this box is idle) and look again.
- Give up after **3 hours**: file nothing, write `main install SKIPPED:
  <TAG>, host never below <nproc> (load <L>)` on the screen, tag `ready`,
  and stop. The manager records it and tries the next build.
- Log each reading (time, load, `nproc`) in `~/waits.log`; the report
  quotes the first and last.

## 1. Install the way a user does

Use a fresh local user with an empty `HOME`, no discobox on `PATH`, and no
server running (`useradd -m mainchk && sudo -iu mainchk`, or a clean
`HOME=$(mktemp -d)`). Then run the documented installer for the main
channel, as ADR 26-11-16-249 §1 gives it:

```sh
curl -fsSL https://main.discobox.ai | sh
```

If that address doesn't answer yet, use the release site's installer with
`--channel main` (`curl -fsSL https://discobox.ai | sh -s -- --channel main`),
and say so in the report. Keep the full output.

## 2. Check

Each is PASS or FAIL, with the evidence:

1. **It installed:** the installer exited 0, and `discobox --version` names
   `TAG` (the newest main build, not a tagged release).
2. **It starts:** `discobox admin server status` (or the release's health
   command) answers, with the server reporting the same version, within 5
   minutes. Record how long it took, and the host's 1-minute load
   (`/proc/loadavg`) beside it.
3. **Nothing pulled from the wrong place:** the installer and the server
   fetched from discobox-ai/discobox-main and the images the main manifest
   names, not from a tagged release (`discobox server manifest`, or the
   installer's output).

Starting boxes, harnesses and pools is out of scope. That's the release
validations' job.

## 3. Report

- **All PASS:** say nothing on GitHub. Write one line to the box screen,
  `main install OK: <TAG>, server up in <s>s (load <L>)`, tag the box
  `ready`, and stop. The manager records it.
- **Any FAIL:** file one discobox issue (`github` worker rules: the triage
  role can file), titled `main build <TAG> doesn't install: <what failed>`,
  labelled `type/bug`, with the failing check, the full installer output (or
  the relevant part), the server log tail, the load, and how to reproduce.
  Then tag the box `ready` and stop.
- **A FAIL at a busy moment is run again, once** (owner, 2026-11-20): sample
  `/proc/loadavg` every 10 seconds during the install and server start. If
  any sample was at or above `nproc`, the failure may be the host: clean up,
  go back to §0 to wait for a quiet host, then run §1–§2 again from scratch
  (a new empty user). **Pass the second time:** report PASS, and mention
  the first run's slowness and load on the screen only. **Fail the second
  time** (or the first failure happened at a quiet load): file the issue,
  with both runs' times, loads and output. Never run a third time.

Clean up whatever you installed (`discobox admin uninstall`, or remove the
user) before you stop.
