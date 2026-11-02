#!/usr/bin/env python3
"""Ask for the manager's GitHub access, built from the role files.

  roles/request.py delegate [--print]   every worker role, for every watched repository,
                                        as a delegation the manager binds to its workers
  roles/request.py self [--print]       the manager's own roles (manager.yaml github:),
                                        in GH_TOKEN

Role files are credential policies (roles/README.md). discobox-access takes
routes, not policy files, so this resolves ${owner}/${repo} for each
repository in manager.yaml and turns every route into the route-string form.
--print shows the request instead of sending it. Run from anywhere; paths are
relative to this repository.
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


def routes(role, repo):
    owner, name = repo.split("/", 1)
    policy = json.load(open(os.path.join(ROOT, "roles", role + ".json")))
    args = {"owner": owner, "repo": name}
    out = []
    for r in policy["routes"]:
        s = ",".join(r["hosts"])
        paths = [re.sub(r"\$\{(\w+)\}", lambda m: args[m.group(1)], p) for p in r.get("paths", [])]
        if paths:
            s += paths[0] + "".join("," + p for p in paths[1:])
        if r.get("methods"):
            s = ",".join(r["methods"]) + " " + s
        if "graphql" in r:
            g = r["graphql"]
            s += " graphql=" + ",".join(g.get("operations", ["*"]))
            if g.get("fields"):
                s += ":" + ",".join(g["fields"])
        if "mcp" in r:
            s += " mcp=" + ",".join(r["mcp"]["tools"])
        if r.get("blocked"):
            s += "=blocked"
        out.append(s)
    return out


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("delegate", "self"):
        sys.exit(__doc__)
    mode, show = sys.argv[1], "--print" in sys.argv[2:]
    repos, self_roles, push_role = manager_yaml()
    pairs = []
    if mode == "delegate":
        roles = worker_roles()
        pairs = [(role, repo) for role in roles for repo in repos]
        req = {"name": "github", "purpose": "delegate",
               "justification": "Give my worker discoboxes GitHub when I create them, each bound only its job's role "
                                f"({', '.join(roles)}), in {', '.join(repos)}."}
    else:
        pairs = [(role, repo) for role in self_roles for repo in repos] + [(push_role, SELF_REPO)]
        req = {"name": "github", "envVar": "GH_TOKEN",
               "justification": f"Manage issues and labels in {', '.join(repos)}, and push my own repository {SELF_REPO}."}
    seen, rs = set(), []
    for role, repo in pairs:
        for r in routes(role, repo):
            if r not in seen:
                seen.add(r); rs.append(r)
    req["routes"] = rs
    req["wait"] = True
    if show:
        print(json.dumps(req, indent=2))
        return
    sys.exit(subprocess.run(["discobox-access", "request", "--json"], input=json.dumps(req), text=True).returncode)


main()
