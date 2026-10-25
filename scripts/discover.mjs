#!/usr/bin/env node
/**
 * discover-skills / discover.mjs
 *
 * Scans a project directory for tech-stack, domain and workflow signals
 * and outputs a JSON report of recommended skills from the installed
 * OpenCode skill catalog.
 *
 * Usage:
 *   node discover.mjs [project-dir] [--pretty]
 *
 * Output (stdout): JSON
 * {
 *   "project": "<dir>",
 *   "profile": {
 *     "languages":  [...],
 *     "frameworks": [...],
 *     "styling":    [...],
 *     "testing":    [...],
 *     "database":   [...],
 *     "infra":      [...],
 *     "signals":    [...],   // short human-readable facts
 *     "taskHints":  [...]    // from user's prompt words (see --task)
 *   },
 *   "skills": [
 *     { "id": "taste-skill", "name": "design-taste-frontend",
 *       "priority": "PRIMARY", "reason": "Next.js + Tailwind + marketing page structure" }
 *   ]
 * }
 *
 * Flags:
 *   --task "..."  Add task description words; the matcher uses them as hints.
 *   --pretty      JSON.stringify with 2-space indent.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------- helpers

const args = process.argv.slice(2);
const pretty = args.includes("--pretty");
const taskIdx = args.indexOf("--task");
const taskText = taskIdx !== -1 ? args[taskIdx + 1] || "" : "";
const positional = args.find(
  (a, i) =>
    !a.startsWith("--") &&
    (i === 0 || (args[i - 1] !== "--task" && !args[i - 1]?.startsWith("--")))
);
const projectDir = path.resolve(positional && !positional.startsWith("--") ? positional : process.cwd());

const exists = (p, root = projectDir) => fs.existsSync(path.join(root, p));
const existsGlob = (prefix, exts, root = projectDir) =>
  exts.some((e) => exists(`${prefix}${e}`, root));

async function readHead(p, lines = 80) {
  try {
    const raw = await fsp.readFile(path.join(projectDir, p), "utf8");
    return raw.split(/\r?\n/).slice(0, lines).join("\n");
  } catch {
    return "";
  }
}

async function listTop(dir) {
  try {
    const entries = await fsp.readdir(path.join(projectDir, dir), { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function hasAnyFile(dir, exts, depth = 2) {
  const out = [];
  async function walk(d, level) {
    const entries = await fsp.readdir(d, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (out.length > 30) return;
      if (e.isDirectory() && level < depth && !e.name.startsWith("node_modules") && !e.name.startsWith(".git")) {
        await walk(path.join(d, e.name), level + 1);
      } else if (e.isFile() && exts.some((x) => e.name.endsWith(x))) {
        out.push(e.name);
      }
    }
  }
  await walk(dir, 0);
  return out;
}

// ---------------------------------------------------------------- scanning

const profile = {
  languages: [],
  frameworks: [],
  styling: [],
  testing: [],
  database: [],
  infra: [],
  signals: [],
  taskHints: [],
};

// 1. package.json (Node ecosystem)
const pkgRaw = await readHead("package.json", 400);
let deps = {};
if (pkgRaw) {
  try {
    const pkg = JSON.parse(pkgRaw);
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const names = Object.keys(deps);
    profile.signals.push(`package.json with ${names.length} dependencies`);

    const fw = [
      ["react", () => names.includes("react")],
      ["next", () => ["next", "nextjs"].some((n) => names.includes(n))],
      ["vue", () => names.some((n) => n === "vue" || n.startsWith("@vue/"))],
      ["nuxt", () => names.includes("nuxt")],
      ["svelte", () => names.some((n) => n.startsWith("svelte"))],
      ["astro", () => names.some((n) => n.startsWith("@astrojs") || n === "astro")],
      ["angular", () => names.some((n) => n === "@angular/core")],
      ["remix", () => names.some((n) => n === "@remix-run/node" || n === "@remix-run/react")],
      ["solid", () => names.includes("solid-js")],
      ["expo-react-native", () => names.some((n) => n.startsWith("expo") || n === "react-native")],
      ["angular-nestjs", () => names.includes("@nestjs/core")],
      ["express", () => names.includes("express")],
      ["fastify", () => names.includes("fastify")],
      ["hono", () => names.includes("hono")],
      ["trpc", () => names.some((n) => n.startsWith("@trpc"))],
      ["prisma", () => names.includes("prisma") || names.includes("@prisma/client")],
      ["drizzle", () => names.some((n) => n.startsWith("drizzle"))],
      ["mongoose-mongodb", () => names.includes("mongoose")],
      ["tailwindcss", () => names.some((n) => n.includes("tailwind"))],
      ["shadcn/radix", () => names.some((n) => n.startsWith("@radix-ui") || n.includes("shadcn"))],
      ["chart.js", () => names.includes("chart.js")],
      ["storyshop-book", () => names.some((n) => n.startsWith("@storybook"))],
      ["playwright", () => names.includes("@playwright/test") || names.includes("playwright")],
      ["vitest", () => names.includes("vitest")],
      ["jest", () => names.includes("jest")],
      ["cypress", () => names.includes("cypress")],
      ["zod", () => names.includes("zod")],
      ["auth-jwt", () => names.some((n) => /jwt|passport|auth0|next-auth|clerk|firebase/.test(n))],
    ];
    for (const [name, test] of fw) if (test()) {
      const bucket =
        name.includes("tailwind") || name.includes("shadcn") ? "styling"
        : /playwright|vitest|jest|cypress/.test(name) ? "testing"
        : /prisma|drizzle|mongoose/.test(name) ? "database"
        : "frameworks";
      profile[bucket].push(name);
    }
  } catch {
    profile.signals.push("package.json unreadable");
  }
} else {
  profile.signals.push("no package.json");
}

// 2. Python / Rust / Go / other ecosystems
if (exists("requirements.txt") || exists("pyproject.toml") || exists("setup.py")) {
  profile.languages.push("python");
  const pyRaw = await readHead("pyproject.toml", 120);
  for (const [name, re] of [
    ["fastapi", /fastapi/i],
    ["django", /django/i],
    ["flask", /flask/i],
    ["sqlalchemy", /sqlalchemy/i],
    ["pytest", /pytest/i],
  ]) {
    if (re.test(pyRaw) || (exists("requirements.txt") && new RegExp(re.source, "i").test(await readHead("requirements.txt")))) {
      const bucket = name === "pytest" ? "testing" : name === "sqlalchemy" ? "database" : "frameworks";
      profile[bucket].push(name);
    }
  }
}
if (exists("Cargo.toml")) profile.languages.push("rust");
if (exists("go.mod")) profile.languages.push("go");
if (exists("Gemfile")) profile.languages.push("ruby");
if (exists("composer.json")) profile.languages.push("php");

if (pkgRaw) profile.languages.push("javascript");

// 3. Framework config files (more reliable than deps sometimes)
const configs = [];
if (existsGlob("next.config.", [".js", ".mjs", ".ts"])) configs.push("next.config");
if (existsGlob("vite.config.", [".js", ".mjs", ".ts"])) configs.push("vite.config");
if (existsGlob("nuxt.config.", [".js", ".mjs", ".ts"])) configs.push("nuxt.config");
if (existsGlob("astro.config.", [".js", ".mjs", ".ts"])) configs.push("astro.config");
if (existsGlob("svelte.config.", [".js", ".mjs", ".ts"])) configs.push("svelte.config");
if (existsGlob("tailwind.config.", [".js", ".mjs", ".ts"]) || existsGlob("postcss.config.", [".js", ".mjs", ".ts"])) configs.push("tailwind/postcss");
if (configs.length) {
  profile.signals.push(`configs: ${configs.join(", ")}`);
  for (const c of configs) {
    if (/next|nuxt|astro|vite/.test(c) && !profile.frameworks.some((f) => /next|nuxt|astro|svelte/.test(f)))
      profile.frameworks.push(c.replace(".config", ""));
    if (/tailwind/.test(c) && !profile.styling.includes("tailwindcss")) profile.styling.push("tailwindcss");
  }
}

// 4. Directory structure
const topDirs = await listTop(".");
if (topDirs.some((d) => /^(app|pages|src|client|web)$/.test(d))) profile.signals.push(`frontend dir: ${topDirs.filter((d) => /^(app|pages|src|client|web)$/.test(d)).join(", ")}`);
if (topDirs.some((d) => /^(api|server|backend|routes|controllers)$/.test(d))) profile.signals.push(`backend dir present`);
if (topDirs.some((d) => /^(prisma|drizzle|migrations|schema)$/.test(d))) profile.signals.push(`database migrations dir`);
if (topDirs.some((d) => /^docs?$/i.test(d))) profile.signals.push(`docs/ dir`);
if (topDirs.some((d) => /^archive|legacy|deprecated|v1$/.test(d))) profile.signals.push(`legacy/deprecated dir`);
if (topDirs.some((d) => /^(components|ui)$/.test(d))) profile.signals.push(`components/ dir`);

// 5. UI file patterns
const uiFiles = await hasAnyFile("src", [".tsx", ".jsx", ".vue", ".svelte", ".astro"]);
if (uiFiles.length) profile.signals.push(`${uiFiles.length}+ UI component files`);

// 6. Test setup
if (existsGlob("playwright.config.", [".js", ".mjs", ".ts", ".cjs"])) profile.testing.push("playwright-config");
if (existsGlob("vitest.config.", [".js", ".mjs", ".ts"])) profile.testing.push("vitest-config");
if (existsGlob("jest.config.", [".js", ".mjs", ".ts", ".cjs"])) profile.testing.push("jest-config");
if (existsGlob("cypress.config.", [".js", ".mjs", ".ts"])) profile.testing.push("cypress-config");

// 7. Infra / CI
const infraChecks = [
  ["Dockerfile", "docker"],
  ["docker-compose.yml", "docker-compose"],
  ["docker-compose.yaml", "docker-compose"],
  [".gitlab-ci.yml", "gitlab-ci"],
  [".circleci", "circleci"],
];
for (const [p, label] of infraChecks) if (exists(p)) profile.infra.push(label);
try {
  if (fs.existsSync(path.join(projectDir, ".github", "workflows"))) profile.infra.push("github-actions");
} catch {}
if (existsGlob("netlify.toml", [""])) profile.infra.push("netlify");
if (existsGlob("vercel.json", [""])) profile.infra.push("vercel");
if (existsGlob("k8s", [""]) && fs.statSync(path.join(projectDir, "k8s")).isDirectory()) profile.infra.push("kubernetes");

// 8. README / docs → purpose keywords
const readme = (await readHead("README.md", 120)) + (await readHead("CLAUDE.md", 60)) + (await readHead("AGENTS.md", 60));
const purpose = { landing: /landing|marketing|portfolio|one[- ]?pager|hero/i };
if (purpose.landing.test(readme)) profile.signals.push("README hints at landing/marketing page");
if (/dashboard|admin panel|analytics/i.test(readme)) profile.signals.push("README hints at dashboard/admin app");
if (/rest api|graphql|openapi|swagger/i.test(readme)) profile.signals.push("README hints at API project");
if (/security|auth(i|enti)cation|encryption/i.test(readme)) profile.signals.push("README hints at auth/security focus");
if (/performance|lighthouse|core web vitals/i.test(readme)) profile.signals.push("README hints at performance focus");
if (/migra(tion|ting)|legacy/i.test(readme)) profile.signals.push("README hints at migration work");

// 9. Task hints from user prompt
const taskWords = taskText.toLowerCase();
const hintMap = [
  ["design|aesthetic|look|premium|gorgeous|redesign landing", "design-visual"],
  ["\\bui\\b|\\bux\\b|interface|component|responsive|accessib", "ui-build"],
  ["\\bapi\\b|endpoint|graphql|\\broute[sr]?\\b", "api-work"],
  ["\\btest\\b|\\bspec\\b|coverage|\\be2e\\b", "testing"],
  ["\\bbug\\b|broken|failing|\\berror\\b|crash|debug", "debugging"],
  ["\\breview\\b|\\baudit\\b|\\bpr\\b|quality", "code-review"],
  ["secur|auth flow|vulnerab|owasp", "security"],
  ["\\bperf\\b|\\bslow\\b|optimi[sz]|lighthouse", "performance"],
  ["deploy|launch|\\bship\\b|release|\\bprod(uction)?\\b", "deploy"],
  ["migrat|deprecat|legacy|old version", "migration"],
  ["\\bdoc\\b|\\breadme\\b|\\badr\\b|\\bspec\\b", "docs"],
  ["\\bdata\\b|database|\\bschema\\b|\\bsql\\b", "database"],
  ["\\bplan\\b|break down|roadmap|estimate", "planning"],
  ["research|learn|how to|find out", "research"],
  ["dashboard|admin|analytics view", "app-screen"],
  ["landing page|marketing site|portfolio|one[- ]pager", "web-page"],
];
for (const [re, hint] of hintMap)
  if (new RegExp(re, "i").test(taskText)) profile.taskHints.push(hint);

// ---------------------------------------------------------------- matching

const hint = (h) => profile.taskHints.includes(h);
const fw = (f) => profile.frameworks.some((x) => x.startsWith(f)) || profile.frameworks.includes(f);
const FE_FLAG = fw("react") || fw("next") || fw("vue") || fw("nuxt") || fw("svelte") || fw("astro") || fw("angular") || fw("solid") || fw("remix") || fw("expo") || uiFiles.length > 0;
const BE_FLAG = fw("nestjs") || fw("express") || fw("fastify") || fw("hono") || profile.frameworks.some((f) => /fastapi|django|flask/.test(f));
const DB_FLAG = profile.database.length > 0 || exists("prisma") || existsGlob("drizzle.config.", [".ts", ".js"]);
const TEST_FLAG = profile.testing.length > 0;
const IS_NEW = profile.signals.every((s) => s === "no package.json") && !uiFiles.length && topDirs.length < 6;

const skills = [
  // frontend / design
  {
    id: "taste-skill",
    name: "design-taste-frontend",
    when: FE_FLAG,
    priority: (hint("design-visual") || hint("web-page") || hint("app-screen")) ? "PRIMARY" : hint("ui-build") ? "SECONDARY" : "SUPPORTING",
    reason: FE_FLAG ? "frontend project detected; anti-slop art direction for pages/screens (use --app for dashboards)" : null,
  },
  {
    id: "frontend-design",
    when: FE_FLAG,
    priority: hint("design-visual") ? "PRIMARY" : (hint("web-page") || hint("app-screen")) ? "SECONDARY" : FE_FLAG ? "SUPPORTING" : null,
    reason: FE_FLAG ? "distinctive visual direction, avoid templated defaults" : null,
  },
  {
    id: "frontend-ui-engineering",
    when: FE_FLAG,
    priority: hint("ui-build") || hint("app-screen") ? "PRIMARY" : FE_FLAG ? "SUPPORTING" : null,
    reason: FE_FLAG ? "production UI quality: design system, state, a11y" : null,
  },
  {
    id: "ui-styling",
    when: (fw("react") || fw("next")) && profile.styling.includes("tailwindcss"),
    priority: profile.styling.includes("shadcn/radix") ? "PRIMARY" : "SUPPORTING",
    reason: "Tailwind detected; shadcn/Radix-based styling workspace",
  },
  {
    id: "ui-ux-pro-max",
    when: FE_FLAG && (hint("design-visual") || hint("ui-build") || hint("app-screen") || hint("web-page")),
    priority: hint("app-screen") ? "PRIMARY" : (hint("design-visual") || hint("web-page")) ? "SECONDARY" : "SUPPORTING",
    reason: "design intelligence lookup (styles, palettes, font pairings, UX guidelines)",
  },
  // work-flow core
  {
    id: "spec-driven-development",
    when: IS_NEW || hint("docs") || hint("planning"),
    priority: IS_NEW ? "PRIMARY" : "SECONDARY",
    reason: IS_NEW ? "empty/unclear project: spec before code" : "task involves specs or planning",
  },
  {
    id: "planning-and-task-breakdown",
    when: hint("planning"),
    priority: hint("planning") ? "PRIMARY" : null,
    reason: "planning vocabulary detected in task",
  },
  {
    id: "incremental-implementation",
    when: (FE_FLAG || BE_FLAG) && !hint("research") && !hint("code-review") && !hint("debugging"),
    priority: "SUPPORTING",
    reason: "multi-layer work: thin verifiable slices",
  },
  {
    id: "test-driven-development",
    when: TEST_FLAG || hint("testing"),
    priority: hint("testing") ? "PRIMARY" : TEST_FLAG ? "SECONDARY" : null,
    reason: TEST_FLAG ? "test runner configured in this project" : null,
  },
  {
    id: "context-engineering",
    when: (FE_FLAG || BE_FLAG),
    priority: "SUPPORTING",
    reason: "load the right context for activated skills",
  },
  // api
  {
    id: "api-and-interface-design",
    when: BE_FLAG || hint("api-work") || profile.signals.some((s) => /API/.test(s)),
    priority: BE_FLAG || hint("api-work") ? "PRIMARY" : null,
    reason: BE_FLAG ? "server framework detected; stable contracts before endpoints change" : null,
  },
  // testing in browser
  {
    id: "browser-testing-with-devtools",
    when: (FE_FLAG && (profile.testing.includes("playwright") || profile.testing.includes("playwright-config"))) || hint("ui-build"),
    priority: "SUPPORTING",
    reason: "real-browser verification of UI behavior",
  },
  {
    id: "webapp-testing",
    when: hint("testing") && FE_FLAG,
    priority: "SUPPORTING",
    reason: "Playwright toolkit for local web app verification",
  },
  // debugging / review / security / perf
  {
    id: "debugging-and-error-recovery",
    when: hint("debugging"),
    priority: "PRIMARY",
    reason: "failure vocabulary detected in task",
  },
  {
    id: "investigate-first",
    when: hint("debugging"),
    priority: "SUPPORTING",
    reason: "diagnosis loop for intermittent/unclear failures",
  },
  {
    id: "code-review-and-quality",
    when: hint("code-review"),
    priority: hint("code-review") ? "PRIMARY" : null,
    reason: "review vocabulary detected in task",
  },
  {
    id: "security-and-hardening",
    when:
      profile.signals.some((s) => /auth\/middleware/.test(s)) ||
      /jwt|passport|next-auth|clerk/.test(Object.keys(deps).join(" ")) ||
      hint("security"),
    priority: hint("security") ? "PRIMARY" : "SUPPORTING",
    reason: hint("security") ? "security vocabulary detected" : "auth/crypto dependencies detected",
  },
  {
    id: "performance-optimization",
    when: hint("performance"),
    priority: hint("performance") ? "PRIMARY" : null,
    reason: "performance vocabulary detected in task",
  },
  // ship / db / docs
  {
    id: "shipping-and-launch",
    when: hint("deploy") || profile.infra.includes("netlify") || profile.infra.includes("vercel"),
    priority: hint("deploy") ? "PRIMARY" : "SUPPORTING",
    reason: hint("deploy") ? "deployment vocabulary detected" : "hosting platform config detected",
  },
  {
    id: "ci-cd-and-automation",
    when: profile.infra.some((i) => /github-actions|gitlab-ci|circleci/.test(i)),
    priority: "SUPPORTING",
    reason: "CI pipeline configured in repo",
  },
  {
    id: "netlify-deploy",
    when: profile.infra.includes("netlify"),
    priority: profile.infra.includes("netlify") && hint("deploy") ? "PRIMARY" : "SUPPORTING",
    reason: "netlify.toml detected",
  },
  {
    id: "migration",
    when: DB_FLAG && (hint("database") || profile.signals.some((s) => /migrations/.test(s))),
    priority: "SUPPORTING",
    reason: "database migrations present; reversible schema transitions",
  },
  {
    id: "deprecation-and-migration",
    when: hint("migration") || profile.signals.some((s) => /legacy/.test(s)),
    priority: hint("migration") ? "PRIMARY" : "SUPPORTING",
    reason: "legacy/migration signals detected",
  },
  {
    id: "documentation-and-adrs",
    when: hint("docs") || exists("docs") || exists("adr"),
    priority: hint("docs") ? "PRIMARY" : "SUPPORTING",
    reason: "documentation directory or vocabulary detected",
  },
  {
    id: "research",
    when: hint("research"),
    priority: hint("research") ? "PRIMARY" : null,
    reason: "research vocabulary detected in task",
  },
  {
    id: "constraint-driven-development",
    when: IS_NEW,
    priority: "SUPPORTING",
    reason: "new project: write the quality bar before code",
  },
  {
    id: "verification-before-completion",
    when: !hint("research") && !hint("code-review") && !hint("docs"),
    priority: "SUPPORTING",
    reason: "always verify before claiming completion",
  },
];

// ---------------------------------------------------------------- dynamic catalog scan
// This makes the recommendation engine future-proof: ANY skill installed in the
// OpenCode skill directories is discovered here and scored against the project
// profile and the task text — no hardcoding needed for new skills.

const HARD_CODES = new Set();
for (const s of skills) {
  if (s.id) HARD_CODES.add(s.id.toLowerCase().replace(/[-_]/g, ""));
  if (s.name) HARD_CODES.add(s.name.toLowerCase().replace(/[-_]/g, ""));
}
const EXCLUDED_META = new Set([
  "discover-skills",
  "auto-skill-discovery",
  "skill-creator",
  "using-superpowers",
  "writing-skills",
]);

const SKILL_ROOTS = [
  path.join(os.homedir(), ".config", "opencode", "skills"),
  path.join(projectDir, ".opencode", "skills"),
];

async function parseSkillFile(file) {
  try {
    const head = (await fsp.readFile(file, "utf8")).split(/\r?\n/).slice(0, 60).join("\n");
    if (!head.startsWith("---")) return null;
    const cut = head.indexOf("\n---", 3);
    const block = head.slice(3, cut === -1 ? head.length : cut + 4); // include the closing fence so the desc lookahead can terminate
    const nameM = block.match(/^name:\s*(.+)$/m);
    const descM = block.match(/^description:\s*([\s\S]*?)(?=\n[a-zA-Z][a-zA-Z-]+:|\n---)/m);
    if (!nameM && !descM) return null;
    const desc = ((descM?.[1] || "").replace(/^[-|>~]+/gm, " ").replace(/["']/g, " ") + " " + (nameM?.[1] || ""))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);
    return { name: (nameM?.[1] || path.basename(path.dirname(file)) || path.basename(file, ".md")).trim(), desc };
  } catch {
    return null;
  }
}

async function loadInstalledSkills() {
  const found = [];
  for (const root of SKILL_ROOTS) {
    const dirents = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
    for (const d of dirents) {
      if (d.name === "README.md" || d.name.startsWith(".")) continue;
      if (d.isFile() && d.name.endsWith(".md")) {
        const s = await parseSkillFile(path.join(root, d.name));
        if (s) found.push(s);
      } else if (d.isDirectory()) {
        const s = await parseSkillFile(path.join(root, d.name, "SKILL.md"));
        if (s) { found.push(s); continue; }
        // one nested level (e.g. category bundles like engineering/)
        const subs = await fsp.readdir(path.join(root, d.name), { withFileTypes: true }).catch(() => []);
        for (const sub of subs) {
          if (!sub.isDirectory()) continue;
          const s2 = await parseSkillFile(path.join(root, d.name, sub.name, "SKILL.md"));
          if (s2) found.push(s2);
        }
      }
    }
  }
  // dedupe by name
  const seen = new Set();
  return found.filter((s) => {
    const k = s.name.toLowerCase().replace(/[-_]/g, "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// query tokens: task text + hint labels + stack terms + signals
const HINT_WORDS = {
  "design-visual": "design aesthetic visual look style",
  "ui-build": "ui component interface build responsive",
  "api-work": "api endpoint rest graphql route contract",
  testing: "test spec coverage automation",
  debugging: "debug bug fix failure error",
  "code-review": "review audit quality standards",
  security: "security authentication vulnerability hardening owasp",
  performance: "performance speed optimization lighthouse",
  deploy: "deploy launch ship production release",
  migration: "migration migrate deprecate legacy",
  docs: "documentation readme adr spec writing",
  database: "database schema sql query",
  planning: "plan breakdown roadmap estimate scope",
  research: "research learn investigate sources",
  "app-screen": "dashboard admin settings inbox analytics screen",
  "web-page": "landing page marketing site portfolio hero",
};
const HINT_LABELS = Object.entries(HINT_WORDS)
  .filter(([label]) => profile.taskHints.includes(label))
  .map(([, words]) => words)
  .join(" ");

const STOPWORDS = new Set(
  ("the and for with from into that this any all not also must should can when use used using skill skills work works how what why " +
    "its have has are was will their them they more most other only than then such before after during without within where which " +
    "while like make made help helps include includes including such set sets ask asks adding create created it you your " +
    "aim aims key main well per e.g etc via ie who whom whose there here each every some none no yes " +
    "package dependencies dependency config configs json yaml format formats file files folder structure output output")
    .split(" ")
    .filter(Boolean)
);
const stem = (w) => {
  let t = w;
  if (t.length > 5 && /ing$/.test(t)) t = t.replace(/ing$/, "");
  else if (t.length > 5 && /ed$/.test(t)) t = t.replace(/ed$/, "");
  else if (t.length > 4 && /es$/.test(t)) t = t.replace(/es$/, "");
  else if (t.length > 4 && /ies$/.test(t)) t = t.replace(/ies$/, "y");
  if (t.length > 4 && /s$/.test(t)) t = t.replace(/s$/, "");
  return t;
};
const tokenize = (str) =>
  str.toLowerCase().replace(/[^a-z0-9+/\-_ ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 2 && w.length < 20 && !STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length > 2);
const queryTokens = new Set(
  tokenize(
    [
      taskText,
      HINT_LABELS,
      profile.languages.join(" "),
      profile.frameworks.join(" "),
      profile.styling.join(" "),
      profile.testing.join(" "),
      profile.database.join(" "),
      profile.infra.join(" "),
      profile.signals.join(" "),
      readme,
    ].join(" ")
  )
);
const taskTokens = new Set(tokenize(taskText + " " + HINT_LABELS));

const installed = await loadInstalledSkills();
const dynamic = [];
for (const sk of installed) {
  const key = sk.name.toLowerCase().replace(/[-_]/g, "");
  if (HARD_CODES.has(key) || EXCLUDED_META.has(key)) continue;
  const own = tokenize(sk.desc);
  const hits = [...new Set(own.filter((t) => queryTokens.has(t)))];
  const taskHits = own.filter((t) => taskTokens.has(t)).length;
  if (process.env.DEBUG_SKILL) console.error(`DBG ${sk.name}: hits=[${hits}] taskHits=${taskHits} | desc="${sk.desc.slice(0, 60)}" own=${own.length} q=${queryTokens.size}`);
  // recommendation gate: 3+ profile keywords, or 2 keywords with 2+ direct task overlaps
  if (hits.length < 3 && !(hits.length >= 2 && taskHits >= 2)) continue;
  dynamic.push({
    id: sk.name,
    name: sk.name,
    priority: hits.length >= 4 && taskHits >= 2 ? "SECONDARY" : "SUPPORTING",
    reason: `dynamic match on ${hits.length} keywords (${hits.slice(0, 6).join(", ")})${taskHits ? `, task overlap: ${taskHits}` : ""}`,
    _score: hits.length * 2 + taskHits * 3,
  });
}
dynamic.sort((a, b) => b._score - a._score);
if (process.env.DEBUG_DYNAMIC) console.error("DYNAMIC ALL:", dynamic.map((d) => `${d.id}[${d._score}]`).join(", "));
const dynamicPicked = dynamic.slice(0, 6).map(({ _score, ...rest }) => rest);

const PRIORITY_ORDER = { PRIMARY: 0, SECONDARY: 1, SUPPORTING: 2 };
const activated = skills
  .filter((s) => s.when && s.reason && s.priority)
  .map((s) => ({ id: s.id, name: s.name || s.id, priority: s.priority, reason: s.reason }))
  .concat(dynamicPicked)
  .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

// ---------------------------------------------------------------- export (--export)
// Creates <projectDir>/discover/ — a self-contained, git-initialized folder with
// the discovery report and every dependency manifest/config, ready to push to GitHub.

const MANIFEST_FILES = [
  "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock",
  "requirements.txt", "constraints.txt", "pyproject.toml", "setup.py", "setup.cfg", "poetry.lock", "uv.lock",
  "Cargo.toml", "Cargo.lock", "go.mod", "go.sum", "Gemfile", "Gemfile.lock",
  "composer.json", "composer.lock", "mix.exs", "pom.xml", "build.gradle", "build.gradle.kts",
  "Package.swift", "nuget.config", "packages.config",
];
const CONFIG_PREFIXES = ["next.config", "vite.config", "nuxt.config", "astro.config", "svelte.config",
  "tailwind.config", "postcss.config", "webpack.config", "rollup.config", "esbuild.config",
  "tsconfig", "jsconfig", "biome.json", "eslint.config", ".eslintrc", "prettier.config", "netlify.toml", "vercel.json"];
const CONFIG_EXTS = ["", ".js", ".mjs", ".cjs", ".ts", ".json", ".yaml", ".yml"];

async function buildExport() {
  const outDir = path.join(projectDir, "discover");
  const depsDir = path.join(outDir, "dependencies");
  const confDir = path.join(outDir, "configs");
  fs.mkdirSync(depsDir, { recursive: true });
  fs.mkdirSync(confDir, { recursive: true });

  const copied = { dependencies: [], configs: [], missing: [] };

  for (const f of MANIFEST_FILES) {
    const src = path.join(projectDir, f);
    if (fs.existsSync(src)) {
      await fsp.copyFile(src, path.join(depsDir, f));
      copied.dependencies.push(f);
    }
  }
  for (const p of CONFIG_PREFIXES) {
    for (const e of CONFIG_EXTS) {
      const rel = `${p}${e}`;
      const src = path.join(projectDir, rel);
      if (fs.existsSync(src) && fs.statSync(src).isFile()) {
        await fsp.copyFile(src, path.join(confDir, path.basename(rel)));
        copied.configs.push(rel);
      }
    }
  }

  // per-language dependency trees snapshot (best-effort, quiet)
  const cmds = [
    ["npm list --depth=0 --json", "npm-tree.json", /^package.json$/.test(copied.dependencies.join(" "))],
    ["pip list --format=json", "pip-list.json", copied.dependencies.some((f) => /requirements|pyproject|setup/.test(f))],
    ["cargo tree", "cargo-tree.txt", copied.dependencies.includes("Cargo.toml")],
    ["go list -m all", "go-mods.txt", copied.dependencies.includes("go.mod")],
  ];
  for (const [cmd, outFile, enabled] of cmds) {
    if (!enabled) continue;
    try {
      const res = execFileSync("sh", ["-c", cmd], { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "ignore"] });
      await fsp.writeFile(path.join(depsDir, outFile), res);
      copied.dependencies.push(outFile);
    } catch {}
  }

  const now = new Date().toISOString();
  const readme = `# ${path.basename(projectDir)} — Discovery Dossier

Auto-generated by \`discover-skills\` on ${now}.

## Contents
- \`report.json\` — full project profile and the skills discover-skills recommends
- \`dependencies/\` — dependency manifests, lock files and dependency-tree snapshots
- \`configs/\` — build/lint/language-server config files used to detect the stack

## Profile summary
- **Languages:** ${profile.languages.join(", ") || "—"}
- **Frameworks:** ${profile.frameworks.join(", ") || "—"}
- **Styling:** ${profile.styling.join(", ") || "—"}
- **Testing:** ${profile.testing.join(", ") || "—"}
- **Database:** ${profile.database.join(", ") || "—"}
- **Infra/CI:** ${profile.infra.join(", ") || "—"}

## Recommended skills
${activated.length ? activated.map((s) => `- **${s.name}** (${s.priority}) — ${s.reason}`).join("\n") : "- none"}

## Push to GitHub
\`\`\`bash
git remote add origin git@github.com:<user>/discover-${path.basename(projectDir)}.git
git push -u origin main
\`\`\`
`;
  await fsp.writeFile(path.join(outDir, "README.md"), readme);
  await fsp.writeFile(path.join(outDir, "report.json"), JSON.stringify({ generated: now, project: projectDir, profile, skills: activated }, null, 2));
  await fsp.writeFile(path.join(outDir, ".gitignore"), "node_modules/\n.DS_Store\n*.log\n.env\n");

  let gitStatus = "git not initialized";
  try {
    try { execFileSync("git", ["-C", outDir, "init", "-b", "main"], { stdio: "ignore" }); }
    catch { execFileSync("git", ["-C", outDir, "init"], { stdio: "ignore" }); }
    execFileSync("git", ["-C", outDir, "add", "."], { stdio: "ignore" });
    const hasId = (() => {
      try { execFileSync("git", ["-C", outDir, "config", "user.email"], { stdio: "ignore" }); return true; }
      catch { try { execFileSync("git", ["-C", projectDir, "config", "user.email"], { stdio: "ignore" }); return true; } catch { return false; } }
    })();
    if (hasId) {
      execFileSync("git", ["-C", outDir, "add", "."], { stdio: "ignore" });
      try {
        execFileSync("git", ["-C", outDir, "commit", "-m", `chore: discovery export ${now}`], { stdio: "ignore" });
        gitStatus = "committed";
      } catch {
        try {
          execFileSync("git", ["-C", outDir, "commit", "-m", `chore: discovery export ${now}`, "--allow-empty"], { stdio: "ignore" });
          gitStatus = "committed";
        } catch { gitStatus = "initialized, commit failed (existing repo?)"; }
      }
    } else {
      gitStatus = "initialized, no git identity — set user.name/user.email then commit";
    }
  } catch { gitStatus = "git unavailable"; }

  return { path: outDir, git: gitStatus, copied };
}

const report = { project: projectDir, profile, skills: activated };
if (args.includes("--export")) {
  report.export = await buildExport();
}
console.log(JSON.stringify(report, null, pretty ? 2 : 0));
