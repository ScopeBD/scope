-- ============================================================
-- SCOPE Internal OS — schema
-- Run this in Supabase → SQL Editor → New query → Run.
-- Safe to re-run: every statement is idempotent.
-- ============================================================

-- ---------- enums ------------------------------------------
-- Lead lifecycle, matching the pipeline columns in the design.
do $$ begin
  create type lead_status as enum (
    'New', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type lead_source as enum (
    'Facebook', 'Instagram', 'LinkedIn', 'Referral', 'Website', 'Other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type project_status as enum (
    'Planning', 'Active', 'On hold', 'Delivered', 'Cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type task_status as enum (
    'Todo', 'In progress', 'Blocked', 'Done'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type invoice_status as enum (
    'Draft', 'Sent', 'Paid', 'Overdue', 'Void'
  );
exception when duplicate_object then null;
end $$;

-- Money direction for the finance ledger.
do $$ begin
  create type entry_kind as enum ('received', 'pending', 'cost');
exception when duplicate_object then null;
end $$;


-- ---------- helpers ----------------------------------------

-- Keep updated_at honest without relying on the client.
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;


-- ---------- team -------------------------------------------
-- Mirrors auth.users. Created automatically on signup so the UI can
-- show owner names/avatars instead of raw uuids.

create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null default '',
  initials    text generated always as (
                upper(left(regexp_replace(full_name, '\s+', '', 'g'), 2))
              ) stored,
  role        text not null default 'member',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_touch on profiles;
create trigger profiles_touch before update on profiles
  for each row execute function touch_updated_at();

-- Auto-create a profile row whenever someone signs up.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();


-- ---------- clients ----------------------------------------

create table if not exists clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  company     text,
  email       text,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists clients_touch on clients;
create trigger clients_touch before update on clients
  for each row execute function touch_updated_at();


-- ---------- leads ------------------------------------------
-- The central table: the pipeline in the design is this table
-- grouped by status.

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  company       text,
  source        lead_source default 'Other',
  budget        numeric(12,2) not null default 0 check (budget >= 0),
  status        lead_status not null default 'New',
  next_followup date,
  owner_id      uuid references profiles(id) on delete set null,
  client_id     uuid references clients(id) on delete set null,
  email         text,
  phone         text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists leads_touch on leads;
create trigger leads_touch before update on leads
  for each row execute function touch_updated_at();

create index if not exists leads_status_idx        on leads (status);
create index if not exists leads_owner_idx         on leads (owner_id);
create index if not exists leads_next_followup_idx on leads (next_followup)
  where next_followup is not null;


-- ---------- projects ---------------------------------------
-- A won lead converts into a project; that is what revenue hangs off.

create table if not exists projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  client_id     uuid references clients(id) on delete set null,
  lead_id       uuid references leads(id) on delete set null,
  status        project_status not null default 'Planning',
  budget        numeric(12,2) not null default 0 check (budget >= 0),
  started_on    date,
  due_on        date,
  delivered_on  date,
  owner_id      uuid references profiles(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists projects_touch on projects;
create trigger projects_touch before update on projects
  for each row execute function touch_updated_at();

create index if not exists projects_status_idx on projects (status);
create index if not exists projects_client_idx on projects (client_id);


-- ---------- tasks ------------------------------------------

create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  project_id    uuid references projects(id) on delete cascade,
  assignee_id   uuid references profiles(id) on delete set null,
  status        task_status not null default 'Todo',
  priority      smallint not null default 2 check (priority between 1 and 3),
  due_on        date,
  blocked_reason text,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists tasks_touch on tasks;
create trigger tasks_touch before update on tasks
  for each row execute function touch_updated_at();

create index if not exists tasks_project_idx  on tasks (project_id);
create index if not exists tasks_assignee_idx on tasks (assignee_id);
create index if not exists tasks_due_idx      on tasks (due_on)
  where status <> 'Done';


-- ---------- invoices + payments ----------------------------

create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text unique,
  client_id     uuid references clients(id) on delete set null,
  project_id    uuid references projects(id) on delete set null,
  amount        numeric(12,2) not null default 0 check (amount >= 0),
  status        invoice_status not null default 'Draft',
  issued_on     date,
  due_on        date,
  paid_on       date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists invoices_touch on invoices;
create trigger invoices_touch before update on invoices
  for each row execute function touch_updated_at();

create index if not exists invoices_status_idx on invoices (status);
create index if not exists invoices_client_idx on invoices (client_id);

create table if not exists payments (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid references invoices(id) on delete cascade,
  amount        numeric(12,2) not null check (amount > 0),
  received_on   date not null default current_date,
  method        text,
  reference     text,
  created_at    timestamptz not null default now()
);

create index if not exists payments_invoice_idx on payments (invoice_id);


-- ---------- finance ledger ---------------------------------
-- Drives the Financial snapshot on the Command Center:
-- received / pending / costs / distributable / fund balances.

create table if not exists finance_entries (
  id            uuid primary key default gen_random_uuid(),
  kind          entry_kind not null,
  label         text not null,
  amount        numeric(12,2) not null check (amount >= 0),
  project_id    uuid references projects(id) on delete set null,
  occurred_on   date not null default current_date,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists finance_entries_touch on finance_entries;
create trigger finance_entries_touch before update on finance_entries
  for each row execute function touch_updated_at();

create index if not exists finance_kind_idx on finance_entries (kind);
create index if not exists finance_date_idx on finance_entries (occurred_on);


-- ---------- aggregate views --------------------------------
-- security_invoker so the RLS policies below still apply when the
-- client queries these through PostgREST.

create or replace view lead_totals with (security_invoker = true) as
select
  status,
  count(*)                              as lead_count,
  coalesce(sum(budget), 0)              as total_budget
from leads
group by status;

-- Financial snapshot in one row, so the dashboard is a single request.
create or replace view finance_snapshot with (security_invoker = true) as
select
  coalesce(sum(amount) filter (where kind = 'received'), 0) as received,
  coalesce(sum(amount) filter (where kind = 'pending'),  0) as pending,
  coalesce(sum(amount) filter (where kind = 'cost'),     0) as costs
from finance_entries;


-- ============================================================
-- Row Level Security
-- Every table is locked down, then opened to signed-in staff only.
-- With RLS on and no permissive policy, the anon key reads nothing —
-- so this is what actually protects your data.
-- ============================================================

alter table profiles        enable row level security;
alter table clients         enable row level security;
alter table leads           enable row level security;
alter table projects        enable row level security;
alter table tasks           enable row level security;
alter table invoices        enable row level security;
alter table payments        enable row level security;
alter table finance_entries enable row level security;

-- Signed-in staff may do anything to operational data.
do $$
declare t text;
begin
  foreach t in array array[
    'clients','leads','projects','tasks',
    'invoices','payments','finance_entries'
  ] loop
    execute format('drop policy if exists staff_all on %I', t);
    execute format(
      'create policy staff_all on %I for all to authenticated '
      'using (true) with check (true)', t
    );
  end loop;
end $$;

-- Profiles: everyone signed in can read the team, but only you can
-- edit your own row.
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to authenticated using (true);

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
