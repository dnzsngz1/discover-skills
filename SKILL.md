---
name: auto-skill-discovery
description: >-
  Automatically discovers and invokes relevant installed skills based on project context and task requirements.
  Scans the project for tech stack, domain, and purpose, then activates matching skills from the available
  skill catalog. Use at the start of any session or when facing a new task domain — it eliminates manual
  skill selection by mapping project signals (package.json, framework configs, file patterns, README content)
  to the right skill combinations. For example: detects a Next.js + Tailwind project with design tasks →
  activates taste-skill (design-taste-frontend), frontend-design, frontend-ui-engineering; detects a
  Python FastAPI project with security concerns → activates security-and-hardening, api-and-interface-design,
  observability-and-instrumentation. The dynamic scanner reads every installed skill's SKILL.md, so newly
  installed skills are recommended automatically with no configuration. When no installed skill fits the
  task and the user approves, it can search GitHub for a matching skill/repo, security-scan it, and install
  it into the project. Can also export the full discovery dossier as a git-ready `discover/` folder
  (report + all dependency manifests/configs) with `--export`. Always run this first when starting work in
  a repository or when the task domain shifts.
---
# Auto Skill Discovery

## Purpose

This meta-skill automatically analyzes the project context (tech stack, domain, file patterns, documentation)
and activates the most relevant installed skills for the current task. It removes the burden of manually
selecting and invoking skills by inferring the right skill combination from project signals.

## When to Use

- **At session start** — run this first to load the right context for the repository
- **When task domain changes** — e.g., switching from API work to UI work, or adding tests
- **When uncertain which skills apply** — let the project tell you what it needs
- **Before any non-trivial work** — ensures you're using the best available workflows

## Discovery Process

### 1. Scan Project Signals

Run these checks in parallel to build a project profile:

```bash
# Tech stack detection
ls -la package.json pnpm-lock.yaml yarn.lock requirements.txt pyproject.toml Cargo.toml go.mod 2>/dev/null
cat package.json 2>/dev/null | head -100
cat pyproject.toml 2>/dev/null | head -100

# Framework configs
ls -la next.config.* vite.config.* nuxt.config.* astro.config.* svelte.config.* 2>/dev/null
ls -la tailwind.config.* postcss.config.* 2>/dev/null
ls -la tsconfig.json 2>/dev/null

# Project documentation
cat README.md 2>/dev/null | head -200
cat CLAUDE.md 2>/dev/null | head -200
cat AGENTS.md 2>/dev/null | head -200

# File patterns
find . -maxdepth 3 -type f \( -name "*.tsx" -o -name "*.jsx" -o -name "*.vue" -o -name "*.svelte" -o -name "*.astro" \) 2>/dev/null | head -20
find . -maxdepth 3 -type f \( -name "*.py" -o -name "*.rs" -o -name "*.go" -o -name "*.java" \) 2>/dev/null | head -20
find . -maxdepth 2 -type d -name "components" -o -name "pages" -o -name "app" -o -name "src" 2>/dev/null

# Test setup
ls -la *test* *spec* playwright.config.* vitest.config.* jest.config.* cypress.config.* 2>/dev/null

# CI/CD
ls -la .github/workflows/ .gitlab-ci.yml .circleci/ 2>/dev/null
```

### 2. Build Project Profile

From the scan, extract:

| Signal | What It Tells You |
|--------|-------------------|
| `package.json` + React/Next.js/Vue/Svelte | Frontend project → UI skills |
| `tailwind.config.js` + component files | Design system work → taste-skill, frontend-design |
| `api/`, `routes/`, `controllers/` + OpenAPI/Swagger | API work → api-and-interface-design |
| `test/`, `spec/`, `playwright`, `vitest` | Testing culture → test-driven-development |
| `Dockerfile`, `docker-compose`, `k8s/`, `.github/workflows/` | Deployment → shipping-and-launch, ci-cd-and-automation |
| `prisma/`, `drizzle/`, `migrations/`, `schema.sql` | Database → migration, netlify-database |
| `middleware/`, `auth/`, `security/`, `helmet` | Security focus → security-and-hardening |
| `metrics/`, `telemetry/`, `prometheus`, `grafana` | Observability → observability-and-instrumentation |
| `docs/`, `ADR/`, `architecture/` | Documentation → documentation-and-adrs |
| `legacy/`, `v1/`, `deprecated/` | Migration → deprecation-and-migration |

### 3. Map to Skills

Use this decision matrix to activate skills:

#### Frontend / Web Design
```
Project has: React/Next.js/Vue/Svelte/Astro + Tailwind/CSS + component files
→ ACTIVATE: taste-skill (design-taste-frontend), frontend-design, frontend-ui-engineering
→ ALSO: ui-styling (if using shadcn/ui), web-artifacts-builder (for complex artifacts)
```

#### Frontend / App Screens (Dashboards, Admin)
```
Project has: React/Next.js + dashboard/admin/routes with tables/forms/charts
→ ACTIVATE: taste-skill (with --app flag), frontend-ui-engineering
→ ALSO: frontend-design (for data visualization choices)
```

#### API / Backend Design
```
Project has: FastAPI/Express/NestJS/Hono + route handlers + OpenAPI
→ ACTIVATE: api-and-interface-design, source-driven-development
→ ALSO: security-and-hardening (if auth/middleware present)
```

#### Full-Stack Feature Work
```
Project has: Frontend + Backend + Database + Tests
→ ACTIVATE: spec-driven-development → planning-and-task-breakdown → incremental-implementation
→ PER LAYER: Frontend skills + API skills + test-driven-development
```

#### Testing / Quality Focus
```
Project has: test/ spec/ + playwright/vitest/jest + CI config
→ ACTIVATE: test-driven-development, browser-testing-with-devtools (if e2e)
→ ALSO: code-review-and-quality, code-simplification
```

#### Security Hardening
```
Project has: auth middleware, helmet, cors, rate-limit, crypto, jwt
→ ACTIVATE: security-and-hardening, observability-and-instrumentation
```

#### Performance Optimization
```
Project has: profiling configs, bundle analyzer, lighthouse, web-vitals
→ ACTIVATE: performance-optimization, frontend-ui-engineering (Core Web Vitals)
```

#### Legacy / Migration
```
Project has: legacy/ v1/ deprecated/ + migration scripts + old/new parallel
→ ACTIVATE: deprecation-and-migration, migration
```

#### Documentation / Specs
```
Task involves: writing specs, ADRs, README, API docs, onboarding
→ ACTIVATE: spec-driven-development, documentation-and-adrs, doc-coauthoring
```

#### Debugging / Incident Response
```
Task involves: "broken", "failing", "slow", "error", "regression", "investigate"
→ ACTIVATE: debugging-and-error-recovery, systematic-debugging, investigate-first
```

#### Code Review / Quality Gate
```
Task involves: "review", "PR", "merge", "quality", "standards"
→ ACTIVATE: code-review-and-quality, receiving-code-review, requesting-code-review
```

#### Planning / Task Breakdown
```
Task involves: "plan", "break down", "estimate", "scope", "roadmap"
→ ACTIVATE: planning-and-task-breakdown, idea-refine (if vague)
```

#### Research / Learning
```
Task involves: "research", "learn", "investigate", "find out", "how to"
→ ACTIVATE: research, autoresearch, academy-guide (for Claude product questions)
```

### 4. Activation Protocol

For each matched skill category:

1. **Read the skill's SKILL.md** to confirm applicability
2. **Invoke the skill** by following its instructions
3. **Chain skills** when multiple apply (e.g., spec → plan → implement → test → review)
4. **Report activated skills** to the user with reasoning

## Execution Flow

```
USER TASK ARRIVES
       │
       ▼
SCAN PROJECT (parallel checks)
       │
       ▼
BUILD PROFILE (tech stack, domain, patterns)
       │
       ▼
MATCH TO SKILL CATEGORIES (decision matrix)
       │
       ▼
FOR EACH MATCHED CATEGORY:
  1. Read skill SKILL.md
  2. Confirm fit for current task
  3. Activate skill (follow its workflow)
  4. Note activation in context
       │
       ▼
REPORT TO USER:
"Activated skills for this task:
- taste-skill (design-taste-frontend): Next.js + Tailwind detected, design task
- frontend-ui-engineering: Building production UI components
- frontend-design: Distinctive visual direction needed
Proceeding with taste-skill run first..."
```

## Skill Invocation Patterns

### Sequential Chain (for feature work)
```
spec-driven-development
    → planning-and-task-breakdown
    → context-engineering
    → source-driven-development
    → incremental-implementation
    → test-driven-development
    → code-review-and-quality
    → code-simplification
    → git-workflow-and-versioning
    → documentation-and-adrs
    → shipping-and-launch
```

### Parallel Activation (for cross-cutting concerns)
```
Frontend task + API task + Security review
    → taste-skill + frontend-ui-engineering (parallel)
    → api-and-interface-design (parallel)
    → security-and-hardening (parallel)
    → observability-and-instrumentation (parallel)
```

### Single Skill (for focused tasks)
```
"Fix this bug" → debugging-and-error-recovery
"Write tests" → test-driven-development
"Review PR" → code-review-and-quality
"Design this page" → taste-skill + frontend-design
```

## Reporting Format

Always report activated skills with this format:

```
## Auto-Activated Skills

| Skill | Reason | Priority |
|-------|--------|----------|
| taste-skill (design-taste-frontend) | Next.js 14 + Tailwind v4 + components/ detected; task involves landing page design | PRIMARY |
| frontend-ui-engineering | Building production-quality React components with accessibility | PRIMARY |
| frontend-design | Need distinctive visual direction, not AI defaults | SUPPORTING |
| test-driven-development | Vitest + Playwright configured; new components need tests | SECONDARY |

Starting with: taste-skill run (step 1: read brief and project)
```

## Override Behavior

User can override by:
- Explicitly invoking a different skill: "Use `ponytail` for this"
- Disabling auto-discovery: "Don't auto-discover, I'll pick skills"
- Adding context: "This is actually an app screen, not a page" → taste-skill uses `--app` mode

## Verification

After activation, verify:
- [ ] At least one PRIMARY skill activated for non-trivial tasks
- [ ] Skills match detected tech stack (no React skills for Vue projects)
- [ ] No conflicting skills activated (e.g., both `taste-skill` and a generic "use Tailwind defaults" approach)
- [ ] User informed of activations before work begins

## Edge Cases

| Situation | Handling |
|-----------|----------|
| No package.json, no clear stack | Ask user; fall back to `interview-me` → `idea-refine` → `spec-driven-development` |
| Multiple frameworks (monorepo) | Detect per-package; activate skills per package context |
| Empty/new project | Activate `spec-driven-development` + `planning-and-task-breakdown` + `constraint-driven-development` |
| Skill not installed | Note missing skill; suggest installation via `cli-plugins-skills` or `omni-github-skills` |
| Conflicting signals (e.g., React + Vue) | Activate skills for both; let task context decide which to use first |

## Integration with Other Meta-Skills

- **using-agent-skills**: This skill supersedes manual skill selection; `using-agent-skills` provides the taxonomy, this provides the automation
- **context-engineering**: Run after this skill to load the right context for activated skills
- **dispatching-parallel-agents**: Use when multiple independent skill activations can run in parallel

## Example Runs

### Example 1: Landing Page Redesign
```
Project: Next.js 14, Tailwind v4, app/ directory, components/ui/, public/images/
Task: "Redesign the landing page to look premium"

SCAN → Profile: React/Next.js + Tailwind + marketing page structure
MATCH → Frontend / Web Design category
ACTIVATE → taste-skill (--sector saas --brief "premium landing page redesign"), frontend-design, frontend-ui-engineering
REPORT → User sees activated skills, taste-skill run begins
```

### Example 2: API Security Audit
```
Project: FastAPI, Python 3.11, JWT auth, rate limiting, PostgreSQL, pytest
Task: "Audit the authentication flow for vulnerabilities"

SCAN → Profile: Python/FastAPI + auth middleware + security deps
MATCH → API / Backend + Security Hardening
ACTIVATE → security-and-hardening, api-and-interface-design, observability-and-instrumentation
REPORT → security-and-hardening run begins with OWASP checklist
```

### Example 3: New Feature in Full-Stack App
```
Project: Monorepo with apps/web (Next.js), apps/api (NestJS), packages/db (Prisma)
Task: "Add user dashboard with real-time notifications"

SCAN → Profile: Full-stack TypeScript, React + NestJS, Prisma, WebSocket
MATCH → Full-Stack Feature Work
ACTIVATE → spec-driven-development → planning-and-task-breakdown → (parallel: taste-skill for web, api-and-interface-design for api) → incremental-implementation → test-driven-development
REPORT → Full chain activated, starts with spec-driven-development
```

## Gap Filling: GitHub Skill Search & Install (user approval required)

When discovery finds no suitable installed skill for the task's domain, the agent
offers to search GitHub — **never silently**.

### Protocol

1. Run discovery; note the domains not covered by any recommended skill
2. Ask the user: *"Katalogda bu konuya uygun skill yok. GitHub'dan arayıp kurmamı ister misin?"*
   (or the English equivalent). Wait for explicit approval.
3. On approval, search:
   ```bash
   node ~/.config/opencode/skills/auto-skill-discovery/scripts/github-skill.mjs \
     search --query "<task keywords> <stack>" --limit 8
   ```
   Candidates come back scored (stars, recency, license, ships a SKILL.md).
4. Show the top 2–3 candidates with their descriptions. Let the user pick —
   or skip if none look trustworthy.
5. Pre-install inspection (optional but recommended for unfamiliar repos):
   ```bash
   node ~/.config/opencode/skills/auto-skill-discovery/scripts/github-skill.mjs \
     inspect --repo <owner/repo>
   ```
6. Dry-run first, then install after the user confirms the report:
   ```bash
   node ~/.config/opencode/skills/auto-skill-discovery/scripts/github-skill.mjs \
     install --repo <owner/repo> [--name <skill-dir>] --dry-run   # shows plan + scan
   node ~/.config/opencode/skills/auto-skill-discovery/scripts/github-skill.mjs \
     install --repo <owner/repo> [--name <skill-dir>]             # actual install
   ```
7. Re-run discovery — the dynamic scanner picks the new skill up automatically
   and recommends it if it matches.

### Security rules (non-negotiable)

- **Silent installation is never allowed.** Every install needs explicit user
  approval of a specific repo.
- Default install target is **project-level** `.opencode/skills/`, never the
  global config directory unless the user explicitly asks.
- The installer security-scans every file: hardcoded secrets/API keys,
  `curl … | sh` install-pipes and destructive `rm -rf /` are **HIGH** findings
  and block the install (override only with `--force`, which requires the user
  to have seen the finding first). `eval`/`child_process`/base64-decode usage is
  **WARN** level, surfaced at dry-run.
- Show the scan findings before proceeding; treat a dry-run + user Look as the
  minimum gate for any first-time repo.
- Clone is shallow (`--depth 1`) in a temp dir; nothing is left behind.

### Heavier alternatives

For large-scale skill discovery (multi-skill repos, CLAUDE.md/.cursorrules
imports, malware heuristics), the heavier installed skills are the better
backend — route to them on request:

- `omni-github-skills` — GitHub-wide skill hunting, scoring and import
- `cli-skill-collector` — detects installed CLI tools and matches skills to them

The lightweight `github-skill.mjs` script is the default path for a single,
targeted install during this skill's flow.

## Export: git-ready discovery dossier

Create `<projectDir>/discover/` — a self-contained folder with the report and
all dependency manifests, initialized as its own git repo, ready to push:

```bash
node ~/.config/opencode/skills/auto-skill-discovery/scripts/discover.mjs . --export
```

Produces:

```
discover/
├── README.md        # profile summary + recommended skills + push instructions
├── report.json      # full profile + skill recommendations (timestamped)
├── dependencies/    # package.json, lockfiles, requirements.txt, pyproject.toml,
│                    # Cargo.toml/lock, go.mod/sum, composer… + dep-tree snapshots
│                    # (npm list / pip list / cargo tree / go list -m all)
└── configs/         # next/vite/tailwind/tsconfig/eslint/prettier/netlify… configs
```

The folder is `git init`-ed on `main` and committed (if a git identity exists).
To publish:

```bash
cd discover
git remote add origin git@github.com:<user>/discover-<project>.git
git push -u origin main
```

## Commands

Run discovery manually:
```bash
# From project root, with the current task text (recommended)
node ~/.config/opencode/skills/auto-skill-discovery/scripts/discover.mjs . \
  --task "redesign the landing page" --pretty

# Explicit project directory
node ~/.config/opencode/skills/auto-skill-discovery/scripts/discover.mjs /path/to/project

# Flags
#   --task "..."   Task description; matched words become taskHints
#   --pretty       Indented JSON output
```

The script scans `package.json`/`requirements.txt`/`pyproject.toml`, framework configs
(next/vite/nuxt/astro/svelte/tailwind), directory structure (`src/`, `app/`, `api/`,
`prisma/`, `docs/`, `legacy/`), test and CI configs, README keywords, and the
`--task` text. Output is JSON: `profile` (languages, frameworks, styling, testing,
database, infra, signals, taskHints) and `skills[]` (id, name, priority, reason).

### Dynamic skill catalog (future-proof)

The script also scans **every installed skill's** `SKILL.md` frontmatter — from
`~/.config/opencode/skills/` and the project's `.opencode/skills/` — and scores each
description against the project profile and task text. This means **any newly
installed skill is recommended automatically**, with no changes needed:

- Curated matches (the hard-coded matrix above) keep their tuned priorities.
- New/unknown skills are recommended as `SUPPORTING` (or `SECONDARY` on strong
  task overlap) with their matched keywords cited in `reason`, top 6 by score.
- Meta skills (`skill-creator`, this skill, etc.) are excluded from self-recommendation.

The agent (you, after loading this skill) should still do the quick manual scan
described above for anything the script cannot see — and to read the activated
skills' SKILL.md files before starting work.

---

**Remember**: This skill runs FIRST. It sets the stage for all subsequent work by ensuring the right expertise is loaded for the project at hand.