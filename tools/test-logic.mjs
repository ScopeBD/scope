/* ============================================================
   Exercises the real admin-shared.js write path in Node.

   The module imports the browser Supabase client, so this strips that
   import and injects a fake whose `from().insert()` records the row it
   was handed. The assertions therefore run against the shipped
   toRow()/derived() logic, not against a copy of it.

     node tools/test-logic.mjs
   ============================================================ */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.join(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets', 'js', 'admin-shared.js');

/* The fake chain is thenable, so both `await q.select().order()` (list) and
   `q.insert(row).select('id').single()` (create) resolve the way the real
   client would. */
const FAKE = `
const calls = [];
const chain = {
  insert(row) { calls.push({ op: 'insert', row }); return chain; },
  update(row) { calls.push({ op: 'update', row }); return chain; },
  delete()    { calls.push({ op: 'delete' }); return chain; },
  select() { return chain; },
  eq() { return chain; },
  neq() { return chain; },
  or() { return chain; },
  order() { return chain; },
  limit() { return chain; },
  single() { return { data: { id: 'fake-id' }, error: null }; },
  maybeSingle() { return { data: null, error: null }; },
  then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
};
const supabase = { from() { return chain; } };
`;

const body = fs
  .readFileSync(SRC, 'utf8')
  .replace(/^import\s*\{[^}]*\}\s*from\s*'\.\/admin-client\.js';?\s*$/m, '');

const tmp = path.join(os.tmpdir(), `scope-logic-${process.pid}.mjs`);
/* `tasks` and `leads` are exported by the module already; only the fake's
   call log needs adding. */
fs.writeFileSync(tmp, `${FAKE}\n${body}\nexport { calls };\n`);

const { calls, tasks, leads, projects } = await import(pathToFileURL(tmp).href);

let pass = 0;
let fail = 0;
const ok = (label) => { pass++; console.log(`  ok    ${label}`); };
const no = (label, got) => { fail++; console.log(`  FAIL  ${label}  -> got ${JSON.stringify(got)}`); };
const check = (label, actual, expected) =>
  actual === expected ? ok(label) : no(label, actual);

/** Run a create and hand back the row the module tried to persist. */
async function inserted(input, ownerId) {
  calls.length = 0;
  await tasks.create(input, ownerId);
  return calls.find((c) => c.op === 'insert')?.row ?? {};
}

async function throwsOn(label, fn, fragment) {
  try {
    await fn();
    no(label, 'no error thrown');
  } catch (e) {
    e.message.includes(fragment) ? ok(label) : no(label, e.message);
  }
}

const lastUpdate = () => calls.find((c) => c.op === 'update')?.row ?? {};

console.log('\npriority — the trap: an empty value must become 2, never 0');

/* `check (priority between 1 and 3)` means a 0 is rejected by Postgres, so
   the generic "empty numeric means 0" rule would break every save.
   A key absent from the form isn't sent at all, so the column's own
   `default 2` applies — also the right answer, and crucially not 0. */
check('omitted -> not sent, DB default applies',
  (await inserted({ title: 'a' })).priority, undefined);
check('empty string -> 2', (await inserted({ title: 'a', priority: '' })).priority, 2);
check('null         -> 2', (await inserted({ title: 'a', priority: null })).priority, 2);
check('"1"          -> 1', (await inserted({ title: 'a', priority: '1' })).priority, 1);
check('"3"          -> 3', (await inserted({ title: 'a', priority: '3' })).priority, 3);
check('never becomes 0', (await inserted({ title: 'a', priority: '' })).priority === 0, false);

await throwsOn('0 is refused',      () => tasks.create({ title: 'a', priority: 0 }),      'Priority must be');
await throwsOn('4 is refused',      () => tasks.create({ title: 'a', priority: 4 }),      'Priority must be');
await throwsOn('"high" is refused', () => tasks.create({ title: 'a', priority: 'high' }), 'must be');

console.log('\ncompleted_at — stamped only while Done');

const done = await inserted({ title: 'a', status: 'Done' });
check('Done is stamped', typeof done.completed_at, 'string');
check('Done stamp is ISO', new Date(done.completed_at).toISOString(), done.completed_at);
check('Todo is unstamped', (await inserted({ title: 'a', status: 'Todo' })).completed_at, null);

/* An edit that doesn't touch status must not wipe the stamp. */
calls.length = 0;
await tasks.update('fake-id', { title: 'renamed' });
check('unrelated edit leaves completed_at alone', 'completed_at' in lastUpdate(), false);

calls.length = 0;
await tasks.setStatus('fake-id', 'Done');
check('setStatus(Done) stamps', typeof lastUpdate().completed_at, 'string');

calls.length = 0;
await tasks.setStatus('fake-id', 'Todo');
check('setStatus off Done unstamps', lastUpdate().completed_at, null);

console.log('\nblocked_reason — survives only while Blocked');

check('kept while Blocked',
  (await inserted({ title: 'a', status: 'Blocked', blocked_reason: 'waiting' })).blocked_reason,
  'waiting');
check('cleared when created already moved on',
  (await inserted({ title: 'a', status: 'Todo', blocked_reason: 'waiting' })).blocked_reason,
  null);

calls.length = 0;
await tasks.setStatus('fake-id', 'In progress');
check('cleared by a status move', lastUpdate().blocked_reason, null);

console.log('\nrequired fields and coercion');

await throwsOn('blank title refused',   () => tasks.create({ title: '   ' }), 'needs a title');
await throwsOn('missing title refused', () => tasks.create({}),               'needs a title');

check('title is trimmed',          (await inserted({ title: '  padded  ' })).title, 'padded');
check('blank date becomes null',   (await inserted({ title: 'a', due_on: '' })).due_on, null);
check('blank project becomes null',(await inserted({ title: 'a', project_id: '' })).project_id, null);

console.log('\nowner / assignee defaults');

check('assignee defaults to the caller', (await inserted({ title: 'a' }, 'user-1')).assignee_id, 'user-1');
check('an explicit Unassigned wins',     (await inserted({ title: 'a', assignee_id: '' }, 'user-1')).assignee_id, null);
check('a picked assignee is kept',       (await inserted({ title: 'a', assignee_id: 'user-9' }, 'user-1')).assignee_id, 'user-9');

/* The shared refactor touched requireName and toRow for every entity, so
   the existing three must still behave exactly as they did. */
console.log('\nregression: the other entities are unchanged');

calls.length = 0;
await leads.create({ name: 'lead', budget: '' }, 'user-1');
const leadRow = calls.find((c) => c.op === 'insert').row;
check('lead budget still defaults to 0', leadRow.budget, 0);
check('lead owner still stamped',        leadRow.owner_id, 'user-1');

await throwsOn('lead without a name still refused', () => leads.create({ name: '' }), 'needs a name');

/* ============================================================
   Conversion — a won lead becomes a project, keeping the link
   ============================================================ */

/** A create, for projects. Same idea as inserted(), different namespace. */
async function insertedProject(input, ownerId) {
  calls.length = 0;
  await projects.create(input, ownerId);
  return calls.find((c) => c.op === 'insert')?.row ?? {};
}

/** The row the last convertFrom() tried to persist. */
async function convertedRow(lead, ownerId) {
  calls.length = 0;
  await projects.convertFrom(lead, ownerId);
  return calls.find((c) => c.op === 'insert')?.row ?? {};
}

console.log('\nprojects — lead_id reaches the database');

/* Without lead_id in PROJECT_COLUMNS, toRow() drops it silently and the
   link back to the lead is lost with no error anywhere. */
check('lead_id is written through',
  (await insertedProject({ name: 'Site rebuild', lead_id: 'lead-1' })).lead_id, 'lead-1');
check('an empty lead_id becomes null, not ""',
  (await insertedProject({ name: 'Site rebuild', lead_id: '' })).lead_id, null);
check('a project with no lead simply omits it',
  'lead_id' in (await insertedProject({ name: 'Site rebuild' })), false);

/* Adding one column to the whitelist must not widen it. */
check('created_at is still refused',
  'created_at' in (await insertedProject({ name: 'x', created_at: '2020-01-01' })), false);
check('id is still refused',
  'id' in (await insertedProject({ name: 'x', id: 'nope' })), false);

console.log('\nconvertFrom — what the new project inherits');

const conv = await convertedRow({
  id: 'lead-1', name: 'Rahim Ahmed', company: 'Acme Ltd', budget: 50000,
  owner: { id: 'user-7' }, client: { id: 'client-3' },
}, 'user-1');

check('links back to the lead',                  conv.lead_id, 'lead-1');
check('names it for the company',                conv.name, 'Acme Ltd');
check('carries the budget',                      conv.budget, 50000);
check('carries the client',                      conv.client_id, 'client-3');
check('carries the lead owner, not the clicker', conv.owner_id, 'user-7');
check('starts at Planning',                      conv.status, 'Planning');

/* A bare lead: no company, no owner, no client. */
const solo = await convertedRow({ id: 'lead-2', name: 'Solo Trader', budget: 0 }, 'user-1');

check('company falls back to the lead name', solo.name, 'Solo Trader');
check('a clientless lead still converts',    solo.client_id, null);
check('an ownerless lead falls to the caller', solo.owner_id, 'user-1');

fs.unlinkSync(tmp);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
