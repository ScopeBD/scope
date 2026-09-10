# SCOPE

Website for SCOPE (scopebd.org) — an independent technology studio in Bangladesh that
builds web, automation, apps and systems for clients. Two halves:

- **Public site** — static HTML at the repo root (`index.html`, `work.html`, `services.html`,
  `about.html`, `contact.html`, `404.html`). Not touched by panel work.
- **Admin panel** — `admin/` + `assets/js/` + `assets/css/admin.css`. A client-work tracker
  (leads → projects → tasks, with invoices/payments still to build) on Supabase.

**`admin/README.md` is the real documentation — read it before changing anything in the
panel.** It has a file map, a "I want to change…" table, the CSS section map, the DB/enum
reference and a symptom→cause→fix table. This file only carries the rules you must not
break, which the README states at length and this states short.

## Stack

No build step, no framework, no dependencies. Native ES modules served to the browser
exactly as they sit on disk. Supabase (Postgres + Auth) is the only backend.

```bash
node serve.js              # http://127.0.0.1:8000 — site at /, panel at /admin/login.html
node tools/check.js        # static checks — parse, unused imports, dead exports, bad $()
node tools/test-logic.mjs  # drives the real toRow()/derived() with a stubbed client
```

**The panel must be served over HTTP.** ES modules will not load from `file://` — a
double-clicked admin page is blank with a console error. That is this, not a bug.

## Invariants — breaking these fails silently

1. **`assets/js/admin-shared.js` owns all database access.** No page contains a `.from(...)`
   call. If a page needs data, it gets a method on the `leads`/`clients`/`projects`/`tasks`
   namespace.
2. **A form field needs two edits, or it saves as `null` with no error** — the page's
   `SHEET_FIELDS` *and* the matching `*_COLUMNS` array in `admin-shared.js`.
3. **Task `completed_at` / `blocked_reason` are derived, not typed.** The logic lives in
   `derived()` (admin-shared.js) and is mirrored in `moveCard()` (admin/tasks.html), so an
   optimistic drag looks right. Change one, change both. `derived()` runs *only when status
   changes* — running it unconditionally wipes `completed_at` on unrelated edits.
4. **Statuses and sources are Postgres enums.** Adding a value means `alter type … add value`
   in the SQL editor *and* the matching array in `admin-shared.js`. Miss the second and the
   value exists but no dropdown offers it.
5. **Empty numerics resolve through `NUMERIC_DEFAULTS`, never a blanket `0`.** `priority` is
   `check (priority between 1 and 3)`, so a `0` default makes every task save fail with
   `23514`. Add a numeric column deliberately.
6. **`esc()` anything from the database that reaches `innerHTML`.** A client named
   `<img onerror=…>` is the realistic attack.
7. **Never commit the Supabase secret / `service_role` key.** It bypasses RLS entirely. The
   *publishable* key in `assets/js/admin-client.js` is fine to publish — RLS is what actually
   protects the data, not the key. There is deliberately no signup screen.

## Verifying a change

There is **no browser automation in this project**. The method that works:

1. `node tools/check.js` — catches a syntax error, an unused import, an export nothing
   imports, a `$('#id')` the page never defines.
2. `node tools/test-logic.mjs` — **run it after any change to `toRow()`, `derived()`, or a
   `*_COLUMNS` list.** It pins that `priority` defaults to 2, that `completed_at` is stamped
   only while Done, and that existing entities still behave.
3. For DB-touching changes, probe the live project with `curl` using the publishable key as
   both `apikey` and `Authorization: Bearer` — **and include a deliberately-invalid control**
   (a column that does not exist), so a real pass is distinguishable from a check that never
   ran. `PGRST204` proves nothing; `42501` has proven everything but the RLS policy.

Be honest about the limit: with RLS on, an unauthenticated probe can prove a query *parses
and type-checks* but not that it returns the right rows.

## Conventions

- **Match the house style.** Comments explain *why*, in prose, and call out traps that were
  actually hit — see the headers of `serve.js` and `tools/check.js`, or any block comment in
  `admin-shared.js`. Do not add comments that restate the code.
- **CSS tokens are shared with the public site** (`--paper --ink --muted --rule --orange
  --orange-bright`); the panel must read as part of SCOPE. `assets/css/admin.css` has a
  fixed section order — the line map is in README §6. Form rules are scoped `.sheet .field …`
  so they do not override the login card.
- **Delete semantics are user-visible.** A client delete leaves projects unlinked
  (`on delete set null`); a project delete destroys its tasks (`on delete cascade`). The
  confirm dialogs say which, out loud.
- **Filtering, sorting and paging happen in the browser**, not in SQL — every row is fetched
  once and `render()` derives the slice. Deliberate at this scale; first thing to change if a
  table passes a few thousand rows.
