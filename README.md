# auto-skill-discovery

An OpenCode skill that **automatically discovers and activates the right skills** for a project
and task — plus **approval-gated skill installation from GitHub** and a **git-ready discovery
dossier export**.

## What it does

1. **Auto-discovery** — scans the project (dependency manifests, framework configs, directory
   structure, README, task text) and recommends the most relevant *installed* skills with
   priorities (`PRIMARY` / `SECONDARY` / `SUPPORTING`), then chains them (spec → plan →
   implement → test → review → ship).
2. **Dynamic catalog scanner** — reads every installed skill's `SKILL.md` frontmatter, so
   *newly installed skills are picked up automatically*, no configuration needed.
3. **Gap filling** — when no installed skill fits the task, search GitHub for a matching
   skill/repo (`search` / `inspect` / `install`), security-scan it (hardcoded secrets,
   `curl | sh`, destructive patterns) and install it into `.opencode/skills/` — always after
   explicit user approval.
4. **Export** — `--export` creates `<project>/discover/`: a self-contained, git-initialized
   dossier with the report, all dependency manifests/lockfiles, dep-tree snapshots and build
   configs — ready to push to GitHub.

## Install

Copy this folder into your OpenCode skills directory:

```bash
git clone https://github.com/dnzsngz1/discover-skills ~/.config/opencode/skills/auto-skill-discovery
```

## Usage

```bash
# sanity check / manual discovery
node scripts/discover.mjs . --task "redesign the landing page" --pretty

# GitHub skill search (approval flow handled by the skill instructions)
node scripts/github-skill.mjs search --query "tailwind landing page skill" --limit 8
node scripts/github-skill.mjs install --repo <owner/repo> --dry-run
node scripts/github-skill.mjs install --repo <owner/repo> --name <skill-dir>

# git-ready dossier export
node scripts/discover.mjs . --export
cd discover && git remote add origin git@github.com:<user>/discover-<project>.git && git push -u origin main
```

Inside an OpenCode session, just invoke the skill — see `SKILL.md` for the full workflow,
decision matrix and security rules.
