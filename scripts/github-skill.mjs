#!/usr/bin/env node
/**
 * auto-skill-discovery / github-skill.mjs
 *
 * Gap filling: find a matching skill/repo on GitHub and install it into the
 * project's skill directory — ALWAYS gated behind explicit user approval at the
 * agent level. This script itself never installs without being invoked on a
 * specific repo the user has approved.
 *
 * Subcommands:
 *   search   --query "keywords"  [--limit 8] [--min-stars 0]
 *   inspect  --repo owner/name
 *   install  --repo owner/name   [--name <skill-dir>] [--dest <dir>] [--force] [--dry-run]
 *
 * Examples:
 *   node github-skill.mjs search --query "tailwind landing page skill"
 *   node github-skill.mjs install --repo DietrichGebert/ponytail --name ponytail
 *
 * Output: JSON on stdout. Requires Node 18+ (global fetch). Works without a
 * GitHub token, unauthenticated (search rate limit: 10 req/min).
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] ?? "" : undefined;
};
const sub = args[0] && !args[0].startsWith("--") ? args[0] : "search";

const GH = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const UA = { "User-Agent": "opencode-auto-skill-discovery", Accept: "application/vnd.github+json" };

const die = (msg) => {
  console.error(msg);
  process.exit(1);
};

async function ghJson(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) {
    if (res.status === 403) die("GitHub API rate limit exceeded (unauthenticated is 10 req/min). Wait or set GITHUB_TOKEN env for authenticated requests.");
    die(`GitHub API ${res.status}: ${url}`);
  }
  return res.json();
}

function normRepo(v) {
  if (!v) die("pass --repo owner/name");
  const m = String(v).replace(/\.git$/, "").match(/github\.com[/:]([^/]+)\/([^/]+)/);
  return m ? `${m[1]}/${m[2].replace(/\.git$/, "")}` : v.replace(/^\/|\/$/g, "");
}

// ---------------------------------------------------------------- search

if (sub === "search") {
  const q = flag("query");
  if (!q) die('pass --query "keywords", e.g. "tailwind landing page skill"');
  const limit = Math.min(parseInt(flag("limit") || "8", 10), 20);
  const minStars = parseInt(flag("min-stars") || "0", 10);
  const token = process.env.GITHUB_TOKEN;
  const headers = { ...UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const cql = `q=${encodeURIComponent(q + " skill")}&sort=stars&order=desc&per_page=15&page=1`;
  const all = await ghJson(`${GH}/search/repositories?${cql}`);
  const repoHits = await ghJson(`${GH}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=15&page=1`).catch(() => ({ items: [] }));
  const items = [...(all.items || []), ...(repoHits.items || [])]
    .filter((r) => !r.fork && r.stargazers_count >= minStars)
    .reduce((acc, r) => (acc.some((x) => x.full_name === r.full_name) ? acc : [...acc, r]), [])
    .slice(0, limit);

  const candidates = [];
  for (const r of items) {
    const c = {
      repo: r.full_name,
      url: r.html_url,
      stars: r.stargazers_count,
      pushed_at: r.pushed_at,
      license: r.license?.spdx_id || null,
      description: (r.description || "").slice(0, 200),
      has_skill: false,
      skill_name: null,
      skill_desc: null,
      default_branch: r.default_branch,
    };
    // does the repo ship a top-level SKILL.md? (reader, not linter)
    try {
      const res = await fetch(`${RAW}/${r.full_name}/${r.default_branch}/SKILL.md`, { headers: UA });
      if (res.ok) {
        const head = (await res.text()).split(/\r?\n/).slice(0, 30).join("\n");
        if (head.startsWith("---")) {
          c.has_skill = true;
          c.skill_name = (head.match(/^name:\s*(.+)$/m) || [, path.basename(r.full_name)])[1]?.trim();
          const dm = head.match(/^description:\s*([\s\S]*?)(?=\n[a-zA-Z][a-zA-Z-]+:|\n---)/m);
          c.skill_desc = dm ? dm[1].replace(/["'>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) : null;
        }
      }
    } catch {}
    c.score =
      Math.min(r.stargazers_count, 500) / 50 +                      // stars, capped
      (Date.now() - new Date(r.pushed_at).getTime() < 3.15e10 ? 5 : 0) + // pushed < 1y
      (r.license ? 3 : 0) +
      (c.has_skill ? 10 : 0);                                       // proper agent skill
    candidates.push(c);
  }
  candidates.sort((a, b) => b.score - a.score);
  console.log(JSON.stringify({ query: q, count: candidates.length, candidates }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- inspect

if (sub === "inspect") {
  const repo = normRepo(flag("repo"));
  const head = await fetch(`${RAW}/${repo}/main/SKILL.md`, { headers: UA })
    .then((r) => (r.ok ? r.text() : fetch(`${RAW}/${repo}/master/SKILL.md`, { headers: UA }).then((r2) => (r2.ok ? r2.text() : null))))
    .catch(() => null);
  if (!head) die(`no top-level SKILL.md on ${repo} (main/master)`);
  console.log(JSON.stringify({ repo, skill: head.split(/\r?\n/).slice(0, 60).join("\n") }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------- install

if (sub === "install") {
  const repo = normRepo(flag("repo"));
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");
  const pickName = flag("name") || undefined;
  const destOverride = flag("dest") || undefined;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skill-install-"));
  // cleanup helper: never leave the clone behind on failure
  const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} };

  // 1. shallow clone (git) or fall back to API tarball
  const cloneTo = path.join(tmp, "repo");
  try {
    execFileSync("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, cloneTo], { stdio: "ignore", timeout: 120000 });
  } catch {
    try {
      const res = await fetch(`${GH}/repos/${repo}/tarball`, { headers: UA, redirect: "follow" });
      if (!res.ok) { cleanup(); die(`cannot fetch ${repo}: git unavailable and tarball HTTP ${res.status}`); }
      const gz = path.join(tmp, "repo.tar.gz");
      await fsp.writeFile(gz, Buffer.from(await res.arrayBuffer()));
      execFileSync("tar", ["-xzf", gz, "-C", tmp]);
      const extracted = fs.readdirSync(tmp).find((n) => n !== "repo.tar.gz");
      fs.renameSync(path.join(tmp, extracted), cloneTo);
    } catch (e) {
      cleanup();
      die(`clone failed: ${e.message}`);
    }
  }

  // 2. locate SKILL.md (repo root, or one or two levels down for multi-skill repos)
  const skillRoots = [];
  let walk = (dir, depth) => {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, d.name);
      if (d.isDirectory() && depth < 3 && d.name !== ".git" && d.name !== "node_modules") walk(full, depth + 1);
      else if (d.isFile() && d.name === "SKILL.md") skillRoots.push(path.dirname(full));
    }
  };
  walk(cloneTo, 0);
  if (!skillRoots.length) { cleanup(); die(`no SKILL.md found anywhere in ${repo}. Not installable as a skill.`); }

  const metaOf = async (root) => {
    try {
      const headTxt = (await fsp.readFile(path.join(root, "SKILL.md"), "utf8")).split(/\r?\n/).slice(0, 60).join("\n");
      const nm = headTxt.match(/^name:\s*(.+)$/m);
      return { name: (pickName && skillRoots.length === 1 ? pickName : undefined) || nm?.[1]?.trim() || path.basename(root), front: headTxt };
    } catch { return { name: path.basename(root), front: "" }; }
  };
  const metas = await Promise.all(skillRoots.map(metaOf));
  const rel = (r) => path.relative(cloneTo, r);
  const options = metas.map((m, i) => ({ name: m.name, rel: rel(skillRoots[i]), root: skillRoots[i] }));
  let chosen;
  if (pickName) {
    chosen = options.find(
      (o) =>
        o.name.toLowerCase().replace(/[-_]/g, "") === pickName.toLowerCase().replace(/[-_]/g, "") ||
        o.rel.toLowerCase() === pickName.toLowerCase().replace(/^\.\//, "")
    );
    if (!chosen) {
      cleanup();
      die(`skill dir "${pickName}" not found. Available:\n` + options.map((o) => `  ${o.name} (${o.rel})`).join("\n"));
    }
  } else if (options.length === 1) {
    chosen = options[0];
  } else {
    cleanup();
    die(
      `${repo} contains ${options.length} skills — pick one with --name. Available:\n` +
        options.map((o) => `  ${o.name} (${o.rel})`).join("\n")
    );
  }
  const { root, name } = { root: chosen.root, name: chosen.name || path.basename(chosen.root) };
  const skillName = String(name).replace(/[^\w.\-]/g, "-");

  // 3. security scan (secrets / pipe-to-shell = HIGH; exec/env use = WARN)
  const PATTERNS = [
    [/curl[^|;&]*\|\s*(ba)?sh|wget[^|;&]*\|\s*(ba)?sh/i, "HIGH", "pipes a download straight into a shell"],
    [/(sk-[A-Za-z0-9]{20,})|(ghp_[A-Za-z0-9]{20,})|(AKIA[0-9A-Z]{16})|(-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----)/, "HIGH", "looks like a hardcoded secret/key"],
    [/rm\s+-rf\s+\/(?!\w|tmp)/, "HIGH", "destructive rm -rf of /"],
    [/eval\(|execSync|spawnSync|child_process/, "WARN", "executes shell/eval code"],
    [/base64\s+(-d|-D|--decode)/, "WARN", "decodes base64 payloads"],
  ];
  const findings = [];
  const files = [];
  (function scan(dir) {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory()) { if (d.name !== ".git" && d.name !== "node_modules") scan(path.join(dir, d.name)); }
      else files.push(path.join(dir, d.name));
    }
  })(root);
  for (const f of files) {
    const stat = fs.statSync(f);
    if (stat.size > 200 * 1024) continue;
    const txt = (await fsp.readFile(f, "utf8").catch(() => "")) || "";
    for (const [re, sev, why] of PATTERNS) if (re.test(txt)) findings.push({ severity: sev, file: path.relative(root, f), why });
  }
  const high = findings.filter((f) => f.severity === "HIGH");
  if (high.length && !force) {
    cleanup();
    die(JSON.stringify({ installed: false, blocked: true, repo, findings }, null, 2));
  }

  // 4. dry-run prints the plan; do nothing yet
  if (dryRun) {
    const out = { installed: false, dry_run: true, repo, skill: skillName, files: files.length, findings, would_install_to: destOverride || path.join(process.cwd(), ".opencode", "skills", skillName) };
    cleanup();
    console.log(JSON.stringify(out, null, 2));
    process.exit(0);
  }

  // 5. copy into place (project .opencode/skills by default — never global without --dest)
  const dest = path.resolve(destOverride || path.join(process.cwd(), ".opencode", "skills", skillName));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  function copyDir(src, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const d of fs.readdirSync(src, { withFileTypes: true })) {
      if (d.name === ".git" || d.name === "node_modules") continue;
      const s = path.join(src, d.name);
      if (d.isDirectory()) copyDir(s, path.join(to, d.name));
      else fs.copyFileSync(s, path.join(to, d.name));
    }
  }
  copyDir(root, dest);
  cleanup();

  console.log(JSON.stringify({
    installed: true,
    repo,
    skill: skillName,
    to: dest,
    findings,
    next: "re-run discover.mjs to activate — the dynamic scanner will pick this up automatically",
  }, null, 2));
  process.exit(0);
}

die("unknown subcommand. use: search | inspect | install");
