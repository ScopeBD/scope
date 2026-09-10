/* ============================================================
   PostToolUse hook — run `node tools/check.js` after an edit.

   Claude Code pipes the tool payload in on stdin. This script
   decides whether the edited file is one check.js actually looks
   at, and if so runs it.

     watched:  assets/js/*.js      (the shared modules)
               admin/*.html        (the pages, incl. inline modules)

   Everything else exits 0 immediately: editing the public site,
   the CSS, the README or serve.js cannot break a check.js rule,
   and running the full report after every keystroke would be noise.

   Exit codes, which matter here:
     0  clean, or nothing to check — silent
     2  check.js flagged something — its report goes to stderr and
        is fed back to Claude as feedback, so the mistake gets
        fixed in the same turn instead of three files later.
        (A plain 1 would only warn you; it would not reach Claude.)

   Deliberately silent when clean — a hook that prints on success
   trains you to ignore it.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

let payload = '';
try {
  payload = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let file = '';
try {
  file = JSON.parse(payload)?.tool_input?.file_path || '';
} catch {
  /* A payload we cannot parse is not this hook's problem. */
  process.exit(0);
}
if (!file) process.exit(0);

const ROOT = path.join(__dirname, '..');
const rel = path.relative(ROOT, file).split(path.sep).join('/');

const watched = /^assets\/js\/[\w.-]+\.js$/.test(rel) || /^admin\/[\w.-]+\.html$/.test(rel);
if (!watched) process.exit(0);

const run = spawnSync(process.execPath, [path.join(__dirname, 'check.js')], {
  cwd: ROOT,
  encoding: 'utf8',
});

if (run.status === 0) process.exit(0);

process.stderr.write(
  `tools/check.js flags problems after editing ${rel}:\n\n` +
    `${(run.stdout || '').trimEnd()}\n\n` +
    'Fix these before moving on — see CLAUDE.md, "Verifying a change".\n'
);
process.exit(2);
