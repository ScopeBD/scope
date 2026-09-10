# SCOPE Internal OS — maintenance guide

An admin panel for scopebd.org, backed by Supabase (Postgres + Auth), sitting
inside a plain static site. No build step, no framework, no dependencies to
install. Every file is served to the browser exactly as it sits on disk.

The public site in the repository root is untouched by anything here.

**New to this?** Read [How a page boots](#2-how-a-page-boots), then
[I want to change…](#3-i-want-to-change) — that table answers most questions
on its own.

---

## 1. File map

### Admin panel

| File | Lines | What it is |
|---|---:|---|
| `admin/login.html` | 100 | Sign-in screen. Standalone — it does not load the shell. |
| `admin/index.html` | 233 | Command Center: KPIs, projects table, needs-attention list. |
| `admin/leads.html` | 772 | Leads: kanban + table, filters, sheet, CSV export. |
| `admin/clients.html` | 569 | Clients: table only, with project counts and contract value rolled up. |
| `admin/projects.html` | 747 | Projects: kanban by stage, tasks rolled up, overdue flagging. |
| `admin/tasks.html` | 854 | Tasks: kanban by status + table, overdue flag, priority, project/assignee filters. |
| `admin/README.md` | — | This file. |

### Shared JavaScript — `assets/js/`

Layers, bottom to top. **A page only ever talks to layer 2 and 3.**

| File | Lines | Owns | Edit it when… |
|---|---:|---|---|
| `admin-client.js` | 27 | The Supabase connection. Holds the URL + publishable key. | You move to a different Supabase project. |
| `admin-shared.js` | 483 | **All database access**, formatting, the auth gate, the enums. | You touch a query, a column list, or a number format. |
| `admin-ui.js` | 299 | Dialog plumbing, confirm gate, kanban drag, pagination, CSV. | You change behaviour shared by 2+ pages. |
| `admin-shell.js` | 232 | Sidebar, topbar, nav config, inline SVG icons, mobile drawer. | You add/reorder a nav item or an icon. |
| `main.js` | 4 | Public site only. Nothing to do with the panel. | Almost never. |

### Styles — `assets/css/`

| File | Lines | |
|---|---:|---|
| `admin.css` | 888 | Everything in the panel. Section map in §6. |
| `main.css` | 5 | Public site only. |

### Other

| File | What it is |
|---|---|
| `supabase/schema.sql` | Tables, enums, indexes, triggers, views, RLS. **Already applied** — it is a record, not a script you re-run. |
| `serve.js` | Local dev server. `node serve.js`. |
| `tools/check.js` | Static checks. `node tools/check.js`. See §8. |
| `tools/test-logic.mjs` | Exercises the real write path in Node. `node tools/test-logic.mjs`. |
| `_ref_admin_panel.png`, `_ref_project_page.png`, `admin panel.jfif`, `project_page.jfif` | Design references. Not loaded by anything — safe to delete. |

---

## 2. How a page boots

Every entity page is the same four steps. `admin/leads.html` is the clearest
example; read it top to bottom once and the others are familiar.

```
1. requireSession()          ← admin-shared.js  — no session? → login.html
2. mountShell(active, session) ← admin-shell.js — paints sidebar + topbar
3. initDialogs()             ← admin-ui.js      — wires close/backdrop/Escape
4. load()                    ← the page         — fetch, render, wire
```

`load()` on every page does the same thing:

```js
const [rows, people] = await Promise.all([leads.list(), fetchProfiles()]);
all = rows;                       // the whole dataset, kept in memory
render();                         // filtered + sorted + paginated view of `all`
```

**Filtering, sorting and paging happen in the browser**, not in SQL. Every row
is fetched once and `render()` derives the visible slice. That is deliberate —
it keeps the queries trivial and the panel snappy at this scale. If a table
ever grows past a few thousand rows, that is the thing to change first.

The inline module lives at the bottom of each page's `<script type="module">`.
Everything above it is markup; everything else is in the shared layer.

---

## 3. I want to change…

| …this | Edit | Notes |
|---|---|---|
| A sidebar label, order, or icon | `admin-shell.js` → `NAV` | 18 items in 7 groups. `href: '#'` = stub. |
| An icon shape | `admin-shell.js` → `icons` | Inline SVG path data, 27 icons. |
| A table's columns | the page's `render()` | |
| A form field | the page's `SHEET_FIELDS` **and** the matching `*_COLUMNS` in `admin-shared.js` | Both, or the field is silently dropped. |
| A dropdown's options | `admin-shared.js` → `LEAD_STATUSES` / `LEAD_SOURCES` / `PROJECT_STATUSES` | Must match the Postgres enum. See §7. |
| A query, join, or sort order | `admin-shared.js` → the `leads` / `clients` / `projects` namespace | The only file that talks to Supabase. |
| How a won lead becomes a project | `admin-shared.js` → `projects.convertFrom()` (the write) and `leads.html` → `convertLead()` (the button) | See §4. `lead_id` is the one field that cannot be recovered if missed. |
| Currency or date formatting | `admin-shared.js` → `money` / `moneyShort` / `shortDate` / `timeAgo` | |
| Colours, spacing, type | `assets/css/admin.css` → the `:root` block | Tokens are shared with the public site. |
| A destructive confirm's wording | the page's `removeX()` → `dangerBody(what, consequence)` | |
| Kanban columns | `PROJECT_STATUSES` / `LEAD_STATUSES` / `TASK_STATUSES` + `wirePipeline(...)` call | Order in the array is the on-screen order. |
| What counts as "overdue" | the page's `isOverdue()` | tasks compares to *local* today; projects still uses UTC. |
| When a task is stamped complete | `derived()` in `admin-shared.js` **and** `moveCard()` in `tasks.html` | Both, or an optimistic drag looks wrong until reload. |
| The Command Center's KPIs | `admin/index.html` | Reads `projects.list()` + `tasks.needsAttention()` + `fetchFinanceSnapshot()`. |
| Which page a nav item opens | `admin-shell.js` → `NAV` `href` | |

### The two-file rule for form fields

A field only reaches the database if it appears in **both** places:

1. `SHEET_FIELDS` in the page — what the sheet renders.
2. `LEAD_COLUMNS` / `CLIENT_COLUMNS` / `PROJECT_COLUMNS` in `admin-shared.js` — what
   `toRow()` lets through.

Miss the second and the field saves as `null` with no error. That is the
single most common way to break something here.

---

## 4. The data layer contract

`admin-shared.js` exports three namespaces with an identical shape. **No page
contains a `.from(...)` call** — that is the invariant to protect.

```js
leads.list()                        // → array, with owner + client joined
leads.create(input, defaultOwnerId) // → the created row, re-read with joins
leads.update(id, input)             // → the updated row, re-read with joins
leads.setStatus(id, status)         // → void; the pipeline drag path
leads.remove(id)                    // → void
// clients has no setStatus (no kanban)
// projects matches leads exactly, plus the one operation below
```

### `projects.convertFrom()` — the cross-entity write

```js
projects.convertFrom(lead, defaultOwnerId)  // → the new project
```

The only operation in the panel that writes to a table other than its own
namespace. It creates a project from a Won lead and sets **`projects.lead_id`**,
which is the only record of where a project came from — miss it and lead-source
attribution cannot be reconstructed later. It carries the name
(`company || name`), budget, client and owner across from the lead and starts
at `Planning`.

It lives here rather than in `leads.html` so the whole conversion is one call
and the page still never touches Supabase. The **button** is in `leads.html`
(the lead sheet, on a Won lead with no project yet).

`lead_id` is in `PROJECT_COLUMNS` so this can write it, but is deliberately
**not** in the project sheet's `SHEET_FIELDS` — so an ordinary project save
never sends it and cannot clear it. Add it to both lists if you ever want a
manual picker.

`create`/`update` re-read the row through `reselect()` so the caller gets the
same shape `list()` returns — joined objects, not raw foreign keys. That is
why a newly created card can be spliced into the list without a refetch.

### `toRow()` — the single write gate

Every write passes through it. It does three things:

- **Whitelists columns.** Only keys in the relevant `*_COLUMNS` array survive.
  This is what protects `created_at`, `updated_at` and the generated
  `profiles.initials` from being written by a form.
- **Coerces types.** Empty strings become `null`, so clearing a field actually
  clears it. Columns listed in `NUMERIC_DEFAULTS` become numbers, and an empty
  value becomes that column's own default — **not** a blanket `0`. This matters:
  `priority` is `check (priority between 1 and 3)`, so defaulting it to zero
  would make every task save fail with `23514`. If you add a numeric column,
  add its default to that map deliberately.
- **Stamps ownership.** On create, `owner_id` is set to the signed-in user
  unless the form deliberately picked someone.

Two task columns are **derived, not typed**: `completed_at` is stamped only
while the status is `Done`, and `blocked_reason` is cleared as soon as the task
moves on. That logic lives in `derived()` in `admin-shared.js`, and the tasks
page mirrors it in `moveCard()` so an optimistic drag looks right immediately.
**If you change one, change both.** `completed_at` is deliberately kept out of
`TASK_COLUMNS`, so no form can set it.

`requireField()` runs after it — Postgres enforces the same constraint, but the
thrown error gives a sentence a human can read. It takes the column name
because tasks label theirs `title` rather than `name`.

### Adding a column to a query

`LEAD_SELECT` / `CLIENT_SELECT` / `PROJECT_SELECT` are template strings. The
`owner:profiles!leads_owner_id_fkey (...)` syntax is PostgREST: `alias:table!constraint`
disambiguates an embed when more than one foreign key points at the same table
(`projects` has both `client_id` and `owner_id`). If you add an embed and get
`PGRST201`, the constraint name is wrong or missing.

---

## 5. Recipe: adding a new entity page

Tasks, invoices and payments have live tables and RLS policies. Tasks is now
built; invoices and payments are next. To add one, copy `admin/clients.html`
(simplest) or `admin/projects.html` (has a kanban) and then:

1. **Add the namespace** in `admin-shared.js` — `*_COLUMNS`, `*_SELECT`, and
   the `list/create/update/remove` object. Copy the `clients` one.
2. **Add the nav entry** in `admin-shell.js` → `NAV`. Change its `href` from
   `'#'` to your new file.
3. **Copy the page**, rename ids to match, and update the inline module's
   imports and `load()`.
4. **Add an enum** to §7 below if the entity has a status column, and mirror it
   as an exported array in `admin-shared.js`.
5. **Run `node tools/check.js`** — it catches the unused imports and stale
   selectors that a copy-paste leaves behind. Then `node tools/test-logic.mjs`.

`admin/tasks.html` is the most recent one, so it is the best worked example of
the pattern. Two things it does that the others don't, and that a new entity
may need:

- **A parent.** Tasks belong to a project, so the page has a project picker, a
  project *filter*, and a `?project=<id>` URL parameter that focuses the list.
  The project column in the table is a button that sets that filter.
- **A conditional field.** `blocked_reason` only applies while the task is
  Blocked, so `syncBlockedField()` shows and hides it with the status.
  `.field[hidden]` in the CSS makes that reliable.

**Check the FK delete semantics** in `supabase/schema.sql` for whether the new
table's foreign key is `on delete set null` or `on delete cascade`, and say
which in the confirm dialog. See §7. A task has no children, so its delete
dialog warns about nothing — that is deliberate, not an oversight.

---

## 6. CSS

`admin.css` is one file in a fixed order. Jump by line:

| Line | Section |
|---:|---|
| 73 | Shell (layout grid) |
| 79 | Sidebar |
| 166 | Main column |
| 232 | Page header |
| 257 | Controls (buttons, search, segmented) |
| 308 | Stat cards |
| 346 | Section heading |
| 360 | Pipeline (kanban) |
| 453 | Table |
| 490 | Badges |
| 545 | Table footer / pagination |
| 564 | Command Center pieces |
| 610 | Login page |
| 662 | Toast |
| 677 | Mobile drawer backdrop |
| 687 | Forms / sheet |
| 735 | Modal |
| 807 | Filter bar |
| 829 | Responsive (`@media`) |

**Tokens** (shared with the public site, so the panel reads as part of SCOPE):

```
--paper #F7F6F2   --ink #141310    --muted #716E67   --rule #D8D5CD
--orange #C23A00  --orange-bright #FF4D00
```

Fonts: **Space Grotesk** for UI, **IBM Plex Mono** for figures and labels.

Two gotchas learned the hard way:

- Screen-scoped rules must be scoped. A bare `.field input` rule would override
  the login card's own `.field input` at equal specificity. Form rules are
  therefore written `.sheet .field input`, and the login page is left alone.
- `.stat .val.sm` exists because a full `BDT 1,250,000.00` overflows a ~180px
  stat card at the default size. Long money uses `moneyShort()` + `sm: true`.

Classes that exist for one screen only:

| Class | Where | Why |
|---|---|---|
| `.pipeline.cols-4` | tasks | Four columns, not six — an empty sixth looked like a failed load. |
| `.prio[data-prio="1\|2\|3"]` | tasks | Priority chip; the lowest number gets the alarm tint. |
| `.linkbtn` | tasks | A table cell that filters rather than navigates. |
| `.field[hidden]` | tasks | `[hidden]` is only a UA rule, so an author `display` would beat it. |
| `.due-over` | tasks | A table cell whose due date has slipped. |

---

## 7. The database

Project `zmxiagusvvhicgoyrklq` (the authoritative URL lives in `admin-client.js`).
All eight tables, both views, and RLS are live. `supabase/schema.sql` is the
record of what was applied.

| Table | Line | Notes |
|---:|---|---|
| `profiles` | 66 | Mirrors `auth.users` via a `SECURITY DEFINER` trigger. Generated `initials`. |
| `clients` | 98 | |
| `leads` | 118 | |
| `projects` | 148 | `lead_id` is written by converting a won lead — see §4. |
| `tasks` | 174 | |
| `invoices` | 200 | |
| `payments` | 221 | |
| `finance_entries` | 238 | |

Views: `lead_totals` (262), `finance_snapshot` (271). Both are
`security_invoker = true` — without that they would bypass RLS, which is the
whole reason they are safe to expose.

### Enums — the database rejects what the UI misspells

Statuses and sources are Postgres enums, not free text. An invalid value is
refused by Postgres with `22P02` rather than quietly stored.

| Enum | Values |
|---|---|
| `lead_status` | New, Contacted, Meeting, Proposal, Won, Lost |
| `lead_source` | Facebook, Instagram, LinkedIn, Referral, Website, Other |
| `project_status` | Planning, Active, On hold, Delivered, Cancelled |
| `task_status` | Todo, In progress, Blocked, Done |
| `invoice_status` | Draft, Sent, Paid, Overdue, Void |
| `entry_kind` | received, pending, cost |

**To add a value:** `alter type lead_status add value 'Qualified';` in the
Supabase SQL editor, then add the same string to the matching array in
`admin-shared.js`. Miss the second step and the value exists in the database
but no dropdown offers it.

**Priority is the exception** — it is a `smallint` with
`check (priority between 1 and 3)`, not an enum, because it has to sort
numerically. `1` is the most urgent. The labels live in `TASK_PRIORITIES` in
`admin-shared.js` (1 = High, 2 = Normal, 3 = Low) and `priorityLabel()` turns a
number into the word the UI shows. Because it is a `not null` numeric column,
an empty value resolves to 2 via `NUMERIC_DEFAULTS` — see §4.

### Foreign keys — what deleting actually does

This is the difference between a safe delete and a destructive one, and the
confirm dialogs state it out loud:

| Deleting | Effect on children | Because |
|---|---|---|
| A **client** | Their projects **survive**, unlinked | `projects.client_id` is `on delete set null` |
| A **project** | Its tasks are **deleted** | `tasks.project_id` is `on delete cascade` |
| A **lead** | The linked project survives, unlinked | `projects.lead_id` is `on delete set null` |
| A **profile** | Nothing is deleted; references go null | `on delete set null` throughout |

`admin-shared.js` repeats these as comments on the relevant `remove()`. Keep
them in step if the schema ever changes.

### RLS

Every table has RLS enabled with a `staff_all` policy granting **authenticated
users only**. With RLS on and no permissive policy for `anon`, anonymous callers
read zero rows. **This is what actually protects the data** — not the key.

`profiles` is the exception: everyone signed in can read the team, but the
`profiles_self_update` policy means you can only edit your own row.

---

## 8. Running it

```bash
node serve.js          # http://127.0.0.1:8000
node serve.js 3000     # different port
```

→ site: `http://127.0.0.1:8000/`
→ panel: `http://127.0.0.1:8000/admin/login.html`

**It must be served over HTTP.** The panel uses native ES modules, which
browsers refuse to load from `file://`. Double-clicking an admin page gives a
blank screen — that is this, not a bug in the page.

```bash
node tools/check.js        # static checks; exit 1 if anything is flagged
node tools/test-logic.mjs  # exercises the write path; exit 1 on failure
```

`tools/check.js` catches the four mistakes that actually happen when editing:
a syntax error in any module, an import a page never uses, an export nothing
imports any more, and a `$('#id')` the page never defines. It has no
dependencies. Run it after any refactor.

`tools/test-logic.mjs` stubs the Supabase client and drives the real
`toRow()` / `derived()` code with a fake that records the row it was handed. It
is what proves the `priority` default is 2 rather than 0, that `completed_at`
is stamped only while Done, and that the existing entities still behave after
a change to the shared layer. **If you change `toRow`, `derived()`, or a
`*_COLUMNS` list, run it.**

### Symptom → cause → fix

| Symptom | Cause | Fix |
|---|---|---|
| Blank page, console says *"Failed to load module"* or a CORS error | Opened over `file://` | `node serve.js`, use `http://` |
| Every list is empty but you are signed in | RLS is doing its job — no session | Sign in again; check the session in DevTools → Application → Local Storage (`scope.admin.auth`) |
| Redirected to `login.html` in a loop | Stale or rejected session | Clear that Local Storage key, sign in again |
| A form field saves as `null`, no error | Missing from `*_COLUMNS` in `admin-shared.js` | Add it — see §3, the two-file rule |
| `22P02` on save | The value is not in the Postgres enum | Add it to the enum *and* to the array in `admin-shared.js` |
| `PGRST204` on save | The column does not exist | Check the spelling against `schema.sql` |
| `PGRST201` on load | Ambiguous embed | Name the FK constraint: `client:clients!projects_client_id_fkey (...)` |
| `42501` | RLS refused the write | You are not signed in, or the policy is missing |
| `401 Secret API key required` from `/rest/v1/` in a raw curl | Expected — the publishable key is not accepted at the bare REST root | Ignore; the SDK sends the right headers |
| A CSS edit appears not to apply | Browser cache | Hard-reload; `serve.js` already sends `Cache-Control: no-store` |
| Two people edit the same row, one change vanishes | No realtime | Reload. See §10. |

### Verifying a change without a browser

There is no browser automation in this project. The method that works:

1. Extract the page's inline module and run `node --check` — or just run
   `node tools/check.js`, which does it for you.
2. Validate a PostgREST select or payload against the live project with `curl`,
   using the publishable key as both `apikey` and `Authorization: Bearer`.
   **Include a deliberately-invalid control** (a column that does not exist)
   so you can tell a real pass from a check that never ran. A payload reaching
   `42501` has proven everything except the RLS policy; a payload reaching
   `PGRST204` has proven nothing at all.

---

## 9. Security rules

**The key in `admin-client.js` is safe to publish.** It is a *publishable* key.
It identifies the project and grants nothing on its own; the RLS policies are
what protect your data, and they are designed for this key to sit in browser
source.

**Never put the secret key in this repository.** Supabase's `service_role` /
secret key bypasses RLS entirely — anyone who views source would read every
row. It belongs only in server-side code, which this static site does not have.

**There is deliberately no signup screen.** Accounts are created in the
Supabase dashboard (Authentication → Users). If you ever add public signup, add
a restricting policy *first* — otherwise anyone could register and the
permissive `staff_all` policy would then let them read and write everything.

**Untrusted text goes through `esc()`.** Anything from the database that
reaches `innerHTML` is escaped with `esc()` from `admin-shared.js`. If you add
a render path, keep that habit — a client named `<img onerror=…>` is the
realistic attack here.

---

## 10. Status: what works, what doesn't

### Fully wired — every operation reaches Postgres

| | Leads | Clients | Projects | Tasks |
|---|---|---|---|---|
| **Create** | "Add Lead" / a column's "+ Add lead" | "Add Client" | "New Project" / a column's "+ New project" | "New Task" / a column's "+ New task" |
| **Read** | Table, kanban, stats, CSV | Table, stats, CSV | Table, kanban, stats, CSV | Table, kanban, stats, CSV |
| **Update** | Kebab or row click; drag or ←/→ to change stage | Kebab or row click | Same as leads | Same as leads |
| **Delete** | Sheet's Delete, behind a confirm | Same | Same | Same |

Kanban cards are draggable **and** keyboard-movable (focus a card, press ←/→),
so no pipeline is mouse-only.

The tasks screen adds two things the others don't have:

- **An overdue flag**, derived from `due_on` against *local* today. `toISOString()`
  would give the UTC date, which in Dhaka is still yesterday until 6am — that
  would call a task due today "overdue" for the first six hours of the day.
  `todayIso()` in `tasks.html` handles this. **`projects.html` still uses the
  UTC form**; it is a six-hour edge there rather than a headline.
- **An "Overdue only" toggle** and a project cell that filters the list.

### Deliberate gaps

These are stopping points, not oversights:

- **Invoices and payments have no screens.** Tables and policies are live.
  §5 is the recipe; tasks is the most recent worked example.
- **A project's lead link is set by conversion only.** A Won lead converts
  (§4), which sets `projects.lead_id`. There is no manual picker: `lead_id`
  is writable in `PROJECT_COLUMNS` but deliberately absent from the project
  sheet's `SHEET_FIELDS`, so a save can neither change nor clear it.
- **A task cannot be reached by direct link.** The Command Center's
  needs-attention panel lists tasks but its rows are plain text — there is no
  `?task=<id>` deep link into the sheet yet.
- **No bulk actions.** Row checkboxes and "select all" work visually; nothing
  acts on the selection. This is most felt on tasks, which are the longest list.
- **Five of the eighteen sidebar items are real** — Command Center, Projects,
  Leads, Clients, Tasks. The rest are `href: '#'` stubs.
- **Fund balances always read `BDT 0.00`.** The schema models
  received/pending/costs, not company/salary funds. Showing a true zero beat
  inventing a number.
- **The USD toggle is cosmetic.** Everything is stored and totalled in BDT; no
  conversion is applied, and the UI says so when clicked.
- **No realtime.** Two people editing at once each see their own copy until
  they reload. Supabase Realtime would fix it if it starts to matter.
