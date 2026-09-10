/* ============================================================
   Static checks for the admin panel.

     node tools/check.js

   No dependencies, no test framework — this is a small site and
   the failure modes are structural, not behavioural. It catches
   the four mistakes that actually happen when editing here:

     1. a syntax error in an inline page module or a shared module
     2. an import the page never uses (dead weight left behind
        after a refactor)
     3. an exported helper in admin-shared.js / admin-ui.js /
        admin-shell.js that nothing imports any more
     4. a $('#id') the page looks up but never defines

   Exit code is 0 when clean, 1 when anything is flagged, so it
   can be wired into a pre-commit hook later if you want.
   ============================================================ */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const JS_DIR = path.join(ROOT, 'assets', 'js');
const ADMIN_DIR = path.join(ROOT, 'admin');

let problems = 0;
const flag = (where, msg) => {
  problems++;
  console.log(`  x ${where}: ${msg}`);
};

/* ---------- parsing --------------------------------------- */

/**
 * Parse a chunk of ES module source by handing it to `node --check`
 * as a .mjs file. This is the only way to get a real ESM parse
 * without launching node with --experimental-vm-modules, and it
 * matters: a naive regex strip mangles multi-line statements and
 * reports false syntax errors.
 */
const TMP = path.join(os.tmpdir(), 'scope-check.mjs');
function parses(src) {
  fs.writeFileSync(TMP, src);
  try {
    execFileSync(process.execPath, ['--check', TMP], { stdio: 'pipe' });
    return null;
  } catch (e) {
    const out = String(e.stderr || e.message);
    const line = out.split('\n').find((l) => l.includes('SyntaxError')) || out.split('\n')[0];
    return line.replace(/^.*SyntaxError:?/, 'SyntaxError:').trim() || 'parse failed';
  }
}

/** Pull every <script type="module"> body out of an HTML file. */
function moduleBodies(html) {
  const out = [];
  const re = /<script[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/** Named imports, grouped by the module they come from. */
function parseImports(src) {
  const out = [];
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const names = m[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/).pop().trim())
      .filter(Boolean);
    out.push({ names, from: m[2] });
  }
  return out;
}

/** Remove whole import statements (they may span several lines). */
const stripImports = (src) => src.replace(/^import\s[\s\S]*?from\s*['"][^'"]+['"];?/gm, '');

/** Every named export of a module on disk. */
function parseExports(file) {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();
  const re = /^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(src))) names.add(m[1]);
  return names;
}

/** Does `src` reference the identifier `name` anywhere? */
function uses(src, name) {
  const esc = name.replace(/[$]/g, '\\$&');
  return new RegExp(`(?<![\\w$])${esc}(?![\\w$])`).test(src);
}

/* ---------- 1. shared modules parse ------------------------ */

console.log('\nsyntax');
const sharedFiles = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js')).sort();
for (const f of sharedFiles) {
  const err = parses(fs.readFileSync(path.join(JS_DIR, f), 'utf8'));
  if (err) flag(`assets/js/${f}`, err);
  else console.log(`  ok  assets/js/${f}`);
}

/* ---------- 2/4. per admin page ---------------------------- */

/* Ids the shell injects at runtime, so a page may legitimately
   look them up without them appearing in its own markup. Pages
   define #sidebar / #topbar themselves; everything else the shell
   builds (sf-name, signout, drawer-open, …) is only ever queried
   from inside admin-shell.js, so this list stays short. */
const SHELL_IDS = new Set(['sidebar', 'topbar']);

const importedSomewhere = new Set();

/* Shared modules import from each other (admin-shell.js uses $, $$ and
   signOut from admin-shared.js). Count those as uses too, otherwise
   every cross-module helper reads as dead. */
for (const f of sharedFiles) {
  const src = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
  for (const { names } of parseImports(src)) names.forEach((n) => importedSomewhere.add(n));
}

for (const file of fs.readdirSync(ADMIN_DIR).filter((f) => f.endsWith('.html')).sort()) {
  const label = `admin/${file}`;
  const html = fs.readFileSync(path.join(ADMIN_DIR, file), 'utf8');
  const bodies = moduleBodies(html);
  console.log(`\n${label}`);

  if (!bodies.length) {
    console.log('  (no inline module)');
    continue;
  }

  const ids = new Set([...html.matchAll(/\sid=["']([^"']+)["']/g)].map((m) => m[1]));

  for (const body of bodies) {
    const err = parses(body);
    if (err) {
      flag(label, err);
      continue;
    }

    const rest = stripImports(body);

    /* 2. unused imports */
    for (const { names, from } of parseImports(body)) {
      const base = from.split('/').pop();
      for (const n of names) {
        importedSomewhere.add(n);
        if (!uses(rest, n)) flag(label, `unused import "${n}" from ${base}`);
      }
    }

    /* 4. selectors with no matching element */
    for (const m of body.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) {
      const id = m[1];
      if (!ids.has(id) && !SHELL_IDS.has(id)) {
        flag(label, `$('#${id}') -- no such element in this page`);
      }
    }

    console.log(`  ok  module parses, ${ids.size} ids in markup`);
  }
}

/* ---------- 3. exports nothing imports -------------------- */

console.log('\nexports');
for (const f of sharedFiles) {
  if (f === 'main.js') continue;
  const names = parseExports(path.join(JS_DIR, f));
  const dead = [...names].filter((n) => !importedSomewhere.has(n));
  if (dead.length) flag(`assets/js/${f}`, `exported but never imported: ${dead.join(', ')}`);
  else console.log(`  ok  ${f} -- all ${names.size} exports used`);
}

console.log(problems ? `\n${problems} problem(s).\n` : '\nAll clean.\n');
process.exit(problems ? 1 : 0);
