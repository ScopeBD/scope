/* ============================================================
   SCOPE Internal OS — shell
   Sidebar, topbar, icons, and the mobile drawer. Both admin pages
   import this so navigation markup lives in exactly one place.
   ============================================================ */

import { supabase } from './admin-client.js';
import { $, $$, signOut } from './admin-shared.js';

/* ---------- icons ----------------------------------------- */

const svg = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  home:    svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
  folder:  svg('<path d="M3 7a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  target:  svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/>'),
  users:   svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.6a3.2 3.2 0 0 1 0 4.8"/><path d="M17.5 13.6A5.5 5.5 0 0 1 20.5 19"/>'),
  check:   svg('<rect x="3.5" y="4.5" width="17" height="16" rx="2.5"/><path d="M8 11.5l2.8 2.8L16 8.5"/>'),
  dollar:  svg('<path d="M12 3v18"/><path d="M16.5 7.5c0-1.9-2-3-4.5-3s-4.5 1.1-4.5 3 2 2.8 4.5 3.2 4.5 1.3 4.5 3.3-2 3-4.5 3-4.5-1.1-4.5-3"/>'),
  doc:     svg('<path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z"/><path d="M14 3.5V8.5h5"/>'),
  card:    svg('<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18"/>'),
  clip:    svg('<path d="M9 4.5h6v2.2H9z"/><path d="M7 6.7H5.8a1.8 1.8 0 0 0-1.8 1.8v9.7a1.8 1.8 0 0 0 1.8 1.8h12.4a1.8 1.8 0 0 0 1.8-1.8V8.5a1.8 1.8 0 0 0-1.8-1.8H17"/>'),
  shield:  svg('<path d="M12 3.2 5 6v6c0 4.3 3 7.6 7 8.8 4-1.2 7-4.5 7-8.8V6z"/>'),
  file:    svg('<path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z"/><path d="M13.5 3.5V9H19"/>'),
  trend:   svg('<path d="M3.5 17.5 9.5 11l4 3.5 7-8"/><path d="M15.5 6.5h5v5"/>'),
  mega:    svg('<path d="M4 10v4a1.5 1.5 0 0 0 1.5 1.5H8l6 4V4.5l-6 4H5.5A1.5 1.5 0 0 0 4 10z"/><path d="M18 9.2a4 4 0 0 1 0 5.6"/>'),
  robot:   svg('<rect x="4" y="8" width="16" height="11" rx="2.5"/><path d="M12 4.5V8"/><circle cx="9" cy="13" r="1.1"/><circle cx="15" cy="13" r="1.1"/>'),
  chart:   svg('<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/>'),
  gear:    svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.5 12H2.1M21.9 12h-2.4M6.3 6.3 4.6 4.6M19.4 19.4l-1.7-1.7M17.7 6.3l1.7-1.7M4.6 19.4l1.7-1.7"/>'),
  search:  svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  filter:  svg('<path d="M3.5 5.5h17l-6.5 7.6V19l-4 2v-7.9z"/>'),
  download:svg('<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>'),
  plus:    svg('<path d="M12 5v14M5 12h14"/>'),
  phone:   svg('<path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z"/>'),
  mail:    svg('<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.6 7 8.4 6 8.4-6"/>'),
  kebab:   svg('<circle cx="12" cy="5.5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="18.5" r="1.4"/>'),
  bell:    svg('<path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9z"/><path d="M13.7 19a2 2 0 0 1-3.4 0"/>'),
  logout:  svg('<path d="M15 4.5h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3"/><path d="M10 16.5 14.5 12 10 7.5"/><path d="M14.5 12H4"/>'),
  inbox:   svg('<path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4"/><path d="M5.5 5h13l2 8.5v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4z"/>'),
  calendar:svg('<rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5v4M16 3.5v4"/>'),
};

/* ---------- navigation ------------------------------------ */

const NAV = [
  { group: null, items: [
    { id: 'command', label: 'Command Center', icon: 'home', href: 'index.html' },
  ]},
  { group: 'Work', items: [
    { id: 'projects', label: 'Projects',  icon: 'folder', href: 'projects.html' },
    { id: 'leads',    label: 'Leads',     icon: 'target', href: 'leads.html', badge: true },
    { id: 'clients',  label: 'Clients',   icon: 'users',  href: 'clients.html' },
    { id: 'tasks',    label: 'Tasks',     icon: 'check',  href: 'tasks.html' },
  ]},
  { group: 'Finance', items: [
    { id: 'finance',  label: 'Finance',   icon: 'dollar', href: '#' },
    { id: 'invoices', label: 'Invoices',  icon: 'doc',    href: '#' },
    { id: 'payments', label: 'Payments',  icon: 'card',   href: '#' },
  ]},
  { group: 'Delivery', items: [
    { id: 'reqs',     label: 'Requirements', icon: 'clip',   href: '#' },
    { id: 'qa',       label: 'QA & Delivery', icon: 'shield', href: '#' },
    { id: 'files',    label: 'Files',        icon: 'file',   href: '#' },
  ]},
  { group: 'Growth', items: [
    { id: 'proposals',label: 'Proposals', icon: 'file',  href: '#' },
    { id: 'marketing',label: 'Marketing', icon: 'mega',  href: '#' },
  ]},
  { group: 'Team', items: [
    { id: 'team',     label: 'Team',           icon: 'users', href: '#' },
    { id: 'kb',       label: 'Knowledge Base', icon: 'inbox', href: '#' },
  ]},
  { group: 'System', items: [
    { id: 'automations', label: 'Automations', icon: 'robot', href: '#' },
    { id: 'reports',     label: 'Reports',     icon: 'chart', href: '#' },
    { id: 'settings',    label: 'Settings',    icon: 'gear',  href: '#' },
  ]},
];

function navMarkup(active) {
  return NAV.map(({ group, items }) => `
    ${group ? `<div class="group">${group}</div>` : ''}
    ${items.map((it) => `
      <a href="${it.href}" ${it.href === '#' ? 'data-todo="1"' : ''}
         ${it.id === active ? 'aria-current="page"' : ''}>
        <span class="ico">${icons[it.icon]}</span>
        <span>${it.label}</span>
        ${it.badge ? `<span class="count" data-lead-count hidden></span>` : ''}
      </a>`).join('')}
  `).join('');
}

/**
 * Render the sidebar + topbar into the placeholders in the page,
 * wire the mobile drawer, populate the signed-in user, and flag the
 * nav items that are not built yet.
 *
 * @param {string} active  nav id to mark as current
 * @param {object} session Supabase session from requireSession()
 */
export async function mountShell(active, session) {
  const sidebar = $('#sidebar');
  const topbar  = $('#topbar');

  sidebar.innerHTML = `
    <div class="brand">
      <img src="../assets/logo-480.png" alt="SCOPE">
      <span class="env">Internal</span>
    </div>
    <nav class="sidenav" aria-label="Admin sections">${navMarkup(active)}</nav>
    <div class="sidefoot">
      <div class="who">
        <span class="avatar" id="sf-initials">—</span>
        <span class="meta">
          <b id="sf-name">…</b>
          <span id="sf-email">${session?.user?.email ?? ''}</span>
        </span>
      </div>
      <button class="btn sm" id="signout" style="width:100%">
        ${icons.logout}<span>Sign out</span>
      </button>
    </div>`;

  const email = session?.user?.email ?? '';
  const meta  = session?.user?.user_metadata?.full_name?.trim();

  topbar.innerHTML = `
    <button class="hamburger" id="drawer-open" aria-label="Open navigation"
            aria-expanded="false" aria-controls="sidebar">☰</button>
    <div class="currency" role="group" aria-label="Display currency">
      <button type="button" data-cur="BDT" aria-pressed="false">৳ BDT</button>
      <button type="button" data-cur="USD" aria-pressed="true">$ USD</button>
    </div>
    <button class="icon-btn" id="bell" aria-label="Notifications">
      ${icons.bell}<span class="dot"></span>
    </button>
    <div class="who">
      <span class="avatar" id="tb-initials">—</span>
      <span class="meta">
        <b id="tb-name">…</b>
        <span>Admin</span>
      </span>
    </div>`;

  /* Prefer the profile row's name; fall back to the auth metadata,
     then to the local part of the email so we never show a blank. */
  let name = meta || email.split('@')[0] || 'Signed in';
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, initials')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profile?.full_name?.trim()) name = profile.full_name.trim();

  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';
  $('#sf-name').textContent = name;
  $('#tb-name').textContent = name;
  $('#sf-initials').textContent = initials;
  $('#tb-initials').textContent = initials;

  $('#signout').addEventListener('click', signOut);

  /* ---------- mobile drawer ---------- */
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  document.body.appendChild(backdrop);

  const openBtn = $('#drawer-open');
  const setOpen = (open) => {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('show', open);
    openBtn.setAttribute('aria-expanded', String(open));
  };
  openBtn.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  /* ---------- not-yet-built links ---------- */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-todo]');
    if (!link) return;
    e.preventDefault();
    toast(`${link.textContent.trim()} is not built yet.`);
  });

  /* ---------- currency toggle (display only) ---------- */
  $$('.currency button').forEach((b) => {
    b.addEventListener('click', () => {
      $$('.currency button').forEach((o) => o.setAttribute('aria-pressed', 'false'));
      b.setAttribute('aria-pressed', 'true');
      toast('Amounts are always stored in BDT. USD display is not wired up yet.');
    });
  });

  $('#bell').addEventListener('click', () => toast('No new notifications.'));
}

/* ---------- toast ----------------------------------------- */

let toastEl;
let toastTimer;

export function toast(message, kind = 'info') {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.dataset.kind = kind;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
}

/* ---------- shared bits used by both pages ---------------- */

/** Fill the sidebar's Leads badge with a live count. */
export function setLeadCount(n) {
  const el = $('[data-lead-count]');
  if (!el) return;
  el.textContent = String(n);
  el.hidden = !n;
}
