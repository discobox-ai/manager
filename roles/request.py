#!/usr/bin/env python3
"""Ask for the manager's GitHub access in one request, from the role files.

  roles/request.py [--print]

One `discobox-access request` (ADR 26-11-02-022) with two parts, each naming
role files with their arguments:

- use, in GH_TOKEN: manager.yaml's github.selfRoles for every repository,
  plus github.pushRole for discobox-ai/manager;
- delegate: every role a job skill names (metadata.discobox.role), for every
  repository, so the manager can bind any worker its role.

The owner approves or denies the two parts on one screen; an approved part
replaces the manager's binding of that kind. --print shows the request
without sending it. Ask again whenever a role, a skill's role or the
repository list changes.
"""
import glob, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SELF_REPO = "discobox-ai/manager"


def manager_yaml():
    text = open(os.path.join(ROOT, "manager.yaml")).read()
    repos = re.findall(r"^\s*-\s*name:\s*(\S+)\s*$", text, re.M)
    self_roles = re.search(r"^\s*selfRoles:\s*\[([^\]]*)\]", text, re.M)
    push_role = re.search(r"^\s*pushRole:\s*(\S+)", text, re.M)
    if not repos or not self_roles or not push_role:
        sys.exit("manager.yaml: repos, github.selfRoles and github.pushRole are required")
    return repos, [r.strip() for r in self_roles.group(1).split(",") if r.strip()], push_role.group(1)


def worker_roles():
    roles = set()
    for path in glob.glob(os.path.join(ROOT, "worker-skills", "*", "SKILL.md")):
        front = open(path).read().split("\n---", 1)[0]
        m = re.search(r"^\s*discobox\.role:\s*(\S+)\s*$", front, re.M)
        if m:
            roles.add(m.group(1))
    if not roles:
        sys.exit("no worker skill names a discobox.role")
    return sorted(roles)


def policies(pairs):
    out, seen = [], set()
    for role, repo in pairs:
        owner, name = repo.split("/", 1)
        key = (role, owner, name)
        if key not in seen:
            seen.add(key)
            out.append({"file": os.path.join(ROOT, "roles", role + ".json"), "args": {"owner": owner, "repo": name}})
    return out


def main():
    show = "--print" in sys.argv[1:]
    repos, self_roles, push_role = manager_yaml()
    workers = worker_roles()
    req = {
        "name": "github",
        "envVar": "GH_TOKEN",
        "policies": policies([(r, repo) for r in self_roles for repo in repos] + [(push_role, SELF_REPO)]),
        "delegate": {"policies": policies([(r, repo) for r in workers for repo in repos])},
        "justification": f"Manage issues and labels in {', '.join(repos)} and push my own repository {SELF_REPO}; "
                         f"delegate the worker roles ({', '.join(workers)}) so I can bind each worker its job's role at launch.",
        "wait": True,
    }
    if show:
        print(json.dumps(req, indent=2))
        return
    sys.exit(subprocess.run(["discobox-access", "request", "--json"], input=json.dumps(req), text=True).returncode)


main()
