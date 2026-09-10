/* ============================================================
   SCOPE Internal OS — shared helpers
   Data access, formatting, and the auth gate used by every
   admin page.
   ============================================================ */

import { supabase } from './admin-client.js';

/* ---------- auth gate ------------------------------------- */

/**
 * Resolve the current session, redirecting to the login page if
 * there isn't one. Every admin page calls this before rendering,
 * so a page can never paint data it isn't allowed to see.
 */
export async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const next = encodeURIComponent(location.pathname.split('/').pop() || 'index.html');
    location.replace(`login.html?next=${next}`);
    return null;
  }
  return session;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.replace('login.html');
}

/* ---------- formatting ------------------------------------ */

const BDT = new Intl.NumberFormat('en-BD', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 25000 -> "BDT 25,000.00" */
export function money(value) {
  return `BDT ${BDT.format(Number(value) || 0)}`;
}

/** Compact form for tight spaces like pipeline cards: "BDT 25,000" */
export function moneyShort(value) {
  return `BDT ${new Intl.NumberFormat('en-BD').format(Number(value) || 0)}`;
}

/** ISO date -> "Sep 10, 2026" */
export function shortDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Relative age for the "Created" column: "3 days ago" */
export function timeAgo(iso) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/** Escape untrusted text before it reaches innerHTML. */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ---------- DOM ------------------------------------------- */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Show a message inside a [data-status] element rather than an alert,
 * matching the inline form feedback used on the public contact page.
 */
export function setStatus(el, message, kind = 'info') {
  if (!el) return;
  el.textContent = message || '';
  el.dataset.kind = kind;
}

/* ---------- data ------------------------------------------ */

export async function fetchFinanceSnapshot() {
  const { data, error } = await supabase
    .from('finance_snapshot')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data ?? { received: 0, pending: 0, costs: 0 };
}

/* ---------- vocabulary -------------------------------------
   These mirror the Postgres enums in supabase/schema.sql. If you add a
   value there, add it here too — the database rejects anything it
   doesn't recognise, which is the point of using enums. The order here
   is the pipeline order on screen.
   ---------------------------------------------------------- */

export const LEAD_STATUSES = ['New', 'Contacted', 'Meeting', 'Proposal', 'Won', 'Lost'];

export const LEAD_SOURCES = [
  'Facebook', 'Instagram', 'LinkedIn', 'Referral', 'Website', 'Other',
];

export const PROJECT_STATUSES = [
  'Planning', 'Active', 'On hold', 'Delivered', 'Cancelled',
];

export const TASK_STATUSES = ['Todo', 'In progress', 'Blocked', 'Done'];

/* Priority is a smallint 1–3 in the schema — 1 is the most urgent, and
   the column defaults to 2. Order here is display order in the sheet. */
export const TASK_PRIORITIES = [
  { value: 1, label: 'High' },
  { value: 2, label: 'Normal' },
  { value: 3, label: 'Low' },
];

/** 1 -> "High". Falls back to Normal for anything unrecognised. */
export function priorityLabel(value) {
  return TASK_PRIORITIES.find((p) => p.value === Number(value))?.label ?? 'Normal';
}

/* ---------- write helpers ---------------------------------
   Every table write goes through toRow(), so there is exactly one
   place that decides what a form is allowed to set and how a value
   is coerced. A column not listed below can never be written from
   the UI, which is what keeps `created_at` and friends safe.
   ---------------------------------------------------------- */

/* Numeric columns, and what a blank field means for each. All of these
   are `not null` in the schema, so an empty input has to resolve to the
   column's own default rather than to null. Note `priority` defaults to
   2, not 0 — `check (priority between 1 and 3)` would reject a 0, so
   the obvious "default every number to zero" would fail on every save. */
const NUMERIC_DEFAULTS = { budget: 0, amount: 0, priority: 2 };

/**
 * Strip a form payload down to writable columns and coerce types to
 * match the schema. Empty strings become null, so clearing a field in
 * a sheet actually clears it rather than being silently ignored.
 */
function toRow(input, columns, { ownerId } = {}) {
  const row = {};
  for (const key of columns) {
    if (!(key in input)) continue;

    let v = input[key];
    if (typeof v === 'string') {
      v = v.trim();
      if (v === '') v = null;
    }

    if (Object.hasOwn(NUMERIC_DEFAULTS, key)) {
      if (v == null) {
        v = NUMERIC_DEFAULTS[key];
      } else {
        v = Number(v);
        if (!Number.isFinite(v)) throw new Error(`"${key}" must be a number.`);
      }
    }

    row[key] = v;
  }

  /* A new record belongs to whoever created it, unless the form
     deliberately picked someone (including "Unassigned"). */
  if (ownerId && !('owner_id' in input)) row.owner_id = ownerId;

  return row;
}

/**
 * Postgres enforces this too; failing here gives a nicer message.
 * `key` is 'name' for most entities and 'title' for tasks, which is
 * the only table here that doesn't name its label column `name`.
 */
function requireField(row, what, key = 'name') {
  if (!row[key]) throw new Error(`A ${what} needs a ${key}.`);
  return row;
}

/** Re-read one row with its joins, ready to splice back into a list. */
async function reselect(table, id, select) {
  const { data, error } = await supabase
    .from(table).select(select).eq('id', id).single();
  if (error) throw error;
  return data;
}

/* ---------- money columns --------------------------------- */

const LEAD_COLUMNS = [
  'name', 'company', 'source', 'budget', 'status', 'next_followup',
  'owner_id', 'client_id', 'email', 'phone', 'notes',
];

const CLIENT_COLUMNS = ['name', 'company', 'email', 'phone', 'notes'];

/* `lead_id` is listed so conversion can set it, but it is deliberately
   NOT a field in the project sheet — so toRow() never sees it on an
   ordinary save and an edit cannot clear it. Add it to SHEET_FIELDS in
   projects.html as well if you ever want a manual picker. */
const PROJECT_COLUMNS = [
  'name', 'client_id', 'lead_id', 'status', 'budget',
  'started_on', 'due_on', 'delivered_on', 'owner_id', 'notes',
];

/* The `projects` embed is what lets the leads page know a lead has
   already been converted without a second query — nothing else links
   the two tables, so the FK hint is unambiguous (README §4). */
const LEAD_SELECT = `
  id, name, company, source, budget, status,
  next_followup, email, phone, notes, created_at,
  owner:profiles!leads_owner_id_fkey ( id, full_name ),
  client:clients!leads_client_id_fkey ( id, name ),
  projects!projects_lead_id_fkey ( id, name )
`;

const CLIENT_SELECT = `
  id, name, company, email, phone, notes, created_at,
  projects ( id, status, budget )
`;

const PROJECT_SELECT = `
  id, name, status, budget, started_on, due_on, delivered_on, notes, created_at,
  lead_id,
  client:clients!projects_client_id_fkey ( id, name ),
  owner:profiles!projects_owner_id_fkey ( id, full_name ),
  lead:leads!projects_lead_id_fkey ( id, name ),
  tasks ( id, status )
`;

/* Tasks label their column `title`, and `completed_at` / `blocked_reason`
   are deliberately absent — they are derived from `status` below, not
   typed, so a form must never be able to set them. */
const TASK_COLUMNS = [
  'title', 'project_id', 'assignee_id', 'status', 'priority',
  'due_on', 'blocked_reason',
];

const TASK_SELECT = `
  id, title, status, priority, due_on, blocked_reason, completed_at, created_at,
  project:projects!tasks_project_id_fkey ( id, name ),
  assignee:profiles!tasks_assignee_id_fkey ( id, full_name )
`;

/* ---------- leads ----------------------------------------- */

export const leads = {
  async list() {
    const { data, error } = await supabase
      .from('leads').select(LEAD_SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(input, defaultOwnerId) {
    const row = requireField(toRow(input, LEAD_COLUMNS, { ownerId: defaultOwnerId }), 'lead');
    const { data, error } = await supabase.from('leads').insert(row).select('id').single();
    if (error) throw error;
    return reselect('leads', data.id, LEAD_SELECT);
  },

  async update(id, input) {
    const row = requireField(toRow(input, LEAD_COLUMNS), 'lead');
    const { error } = await supabase.from('leads').update(row).eq('id', id);
    if (error) throw error;
    return reselect('leads', id, LEAD_SELECT);
  },

  /** Just the pipeline move — no join refetch needed for a drag. */
  async setStatus(id, status) {
    const { error } = await supabase.from('leads').update({ status }).eq('id', id);
    if (error) throw error;
  },

  async remove(id) {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ---------- clients --------------------------------------- */

export const clients = {
  async list() {
    const { data, error } = await supabase
      .from('clients').select(CLIENT_SELECT)
      .order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async create(input) {
    const row = requireField(toRow(input, CLIENT_COLUMNS), 'client');
    const { data, error } = await supabase.from('clients').insert(row).select('id').single();
    if (error) throw error;
    return reselect('clients', data.id, CLIENT_SELECT);
  },

  async update(id, input) {
    const row = requireField(toRow(input, CLIENT_COLUMNS), 'client');
    const { error } = await supabase.from('clients').update(row).eq('id', id);
    if (error) throw error;
    return reselect('clients', id, CLIENT_SELECT);
  },

  /** Projects survive this — their client_id is set to null by the FK. */
  async remove(id) {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ---------- projects -------------------------------------- */

export const projects = {
  async list() {
    const { data, error } = await supabase
      .from('projects').select(PROJECT_SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(input, defaultOwnerId) {
    const row = requireField(toRow(input, PROJECT_COLUMNS, { ownerId: defaultOwnerId }), 'project');
    const { data, error } = await supabase.from('projects').insert(row).select('id').single();
    if (error) throw error;
    return reselect('projects', data.id, PROJECT_SELECT);
  },

  /**
   * Turn a Won lead into a project, carrying the link that says where it
   * came from. The only cross-entity write in the panel, and it lives
   * here rather than in leads.html so that one call does the whole
   * conversion — the page never has to assemble a project row itself,
   * and the "no page talks to Supabase" rule still holds.
   *
   * `lead_id` is the point of it. Without that column set, which lead
   * produced a project is unknowable afterwards and lead-source
   * attribution is gone for good — there is no reconstructing it.
   *
   * The project is named for the company where there is one, because a
   * project called after the contact person reads oddly. Both are
   * editable in the sheet straight after.
   */
  async convertFrom(lead, defaultOwnerId) {
    const input = {
      name: lead.company || lead.name,
      lead_id: lead.id,
      client_id: lead.client?.id ?? lead.client_id ?? null,
      budget: lead.budget ?? 0,
      /* A won deal is not yet Active — Planning is the schema default. */
      status: 'Planning',
    };

    /* Carry the owner, so the project stays with whoever worked the
       lead rather than landing on whoever happened to click Convert.
       Only when the lead has one; otherwise the caller owns it. */
    const ownerId = lead.owner?.id ?? lead.owner_id;
    if (ownerId) input.owner_id = ownerId;

    return projects.create(input, defaultOwnerId);
  },

  async update(id, input) {
    const row = requireField(toRow(input, PROJECT_COLUMNS), 'project');
    const { error } = await supabase.from('projects').update(row).eq('id', id);
    if (error) throw error;
    return reselect('projects', id, PROJECT_SELECT);
  },

  async setStatus(id, status) {
    const { error } = await supabase.from('projects').update({ status }).eq('id', id);
    if (error) throw error;
  },

  /** Careful: tasks.project_id cascades, so this takes the tasks with it. */
  async remove(id) {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  },
};

/* ---------- tasks ----------------------------------------- */

/**
 * Two task columns are derived from `status` rather than typed, and
 * keeping them in step here is what stops the UI leaving a stale
 * "waiting on the client" reason on a task that has since shipped.
 *
 * Only called when the status is actually changing — applying it
 * unconditionally would wipe `completed_at` on every unrelated edit.
 */
function derived(status) {
  const out = {
    completed_at: status === 'Done' ? new Date().toISOString() : null,
  };
  /* A reason is meaningful only while blocked, so moving on clears it. */
  if (status !== 'Blocked') out.blocked_reason = null;
  return out;
}

/** Keeps a bad priority a readable message rather than a 23514. */
function requirePriority(row) {
  const p = row.priority;
  if (p !== undefined && !(p >= 1 && p <= 3)) {
    throw new Error('Priority must be High, Normal or Low.');
  }
  return row;
}

export const tasks = {
  async list() {
    const { data, error } = await supabase
      .from('tasks').select(TASK_SELECT)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async create(input, defaultAssigneeId) {
    const row = requirePriority(requireField(toRow(input, TASK_COLUMNS), 'task', 'title'));
    /* A task created already Done shouldn't sit there unstamped. */
    Object.assign(row, derived(row.status));
    if (defaultAssigneeId && !('assignee_id' in input)) row.assignee_id = defaultAssigneeId;

    const { data, error } = await supabase.from('tasks').insert(row).select('id').single();
    if (error) throw error;
    return reselect('tasks', data.id, TASK_SELECT);
  },

  async update(id, input) {
    const row = requirePriority(requireField(toRow(input, TASK_COLUMNS), 'task', 'title'));
    if ('status' in input) Object.assign(row, derived(row.status));

    const { error } = await supabase.from('tasks').update(row).eq('id', id);
    if (error) throw error;
    return reselect('tasks', id, TASK_SELECT);
  },

  /** The pipeline drag path — same stamping as update(), one round trip. */
  async setStatus(id, status) {
    const { error } = await supabase
      .from('tasks').update({ status, ...derived(status) }).eq('id', id);
    if (error) throw error;
  },

  async remove(id) {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },

  /**
   * Tasks that want a look: overdue, blocked, or due within `days`.
   *
   * This lives here rather than in the Command Center because that page
   * used to reach for the Supabase client itself, which broke the rule
   * that no page talks to the database directly.
   */
  async needsAttention(days = 3, limit = 10) {
    const soon = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, status, due_on, blocked_reason')
      .neq('status', 'Done')
      /* PostgREST or-filter: either past its date, or blocked outright. */
      .or(`due_on.lte.${soon},status.eq.Blocked`)
      .order('due_on', { ascending: true, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};

/* ---------- shared lookups --------------------------------- */

/** The team, for any owner picker. Ordered by name for a stable list. */
export async function fetchProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Just enough of each client to fill a <select>. */
export async function fetchClientOptions() {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Just enough of each project to fill a <select>. */
export async function fetchProjectOptions() {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) throw error;
  return data ?? [];
}
