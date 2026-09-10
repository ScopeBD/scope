/* ============================================================
   SCOPE Internal OS — shared UI behaviour
   ------------------------------------------------------------
   The parts of the panel that are identical on every entity page:
   dialogs, the confirm gate for destructive actions, the kanban
   drag/keyboard move, pagination, and select filling.

   Anything entity-specific (columns, cards, filters, the sheet's
   fields) stays in the page itself, because those genuinely differ.
   ============================================================ */

import { $, $$, esc } from './admin-shared.js';

/* ---------- dialogs --------------------------------------- */

/**
 * The confirm dialog is identical on every page, so it's built here
 * rather than pasted into each one. Pages only carry the sheet markup
 * that genuinely differs. Idempotent: safe to call twice.
 */
function ensureConfirmDialog() {
  if ($('#confirm-modal')) return;

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'confirm-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="sheet confirm" role="alertdialog" aria-modal="true"
         aria-labelledby="confirm-h">
      <div class="sheet-head">
        <div><h2 id="confirm-h">Are you sure?</h2></div>
      </div>
      <div class="sheet-body" id="confirm-body"></div>
      <div class="sheet-foot">
        <span class="push"></span>
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn danger" id="confirm-yes">Delete</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
}

/**
 * Wire the shared modal plumbing once per page: close buttons,
 * backdrop clicks, and Escape. Escape closes only the top-most open
 * dialog, so a confirm raised from inside a sheet dismisses the
 * confirm and leaves the sheet behind it.
 */
export function initDialogs() {
  ensureConfirmDialog();

  $$('[data-close]').forEach((b) => {
    b.addEventListener('click', () => {
      const modal = b.closest('.modal');
      if (modal) closeDialog(`#${modal.id}`);
    });
  });

  $$('.modal').forEach((m) => {
    /* mousedown, not click: a drag that starts inside the sheet and
       ends on the backdrop shouldn't close the dialog. */
    m.addEventListener('mousedown', (e) => {
      if (e.target === m) closeDialog(`#${m.id}`);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    /* confirmDialog owns Escape while it's open — without this, one
       press would dismiss the confirm *and* the sheet behind it. */
    const confirm = $('#confirm-modal');
    if (confirm && !confirm.hidden) return;

    const open = $$('.modal:not([hidden])');
    if (open.length) closeDialog(`#${open[open.length - 1].id}`);
  });
}

export function openDialog(sel) {
  $(sel).hidden = false;
  lockScroll();
}

export function closeDialog(sel) {
  const el = $(sel);
  if (!el) return;
  el.hidden = true;
  lockScroll();
}

/** Only unlock the page once the last dialog has closed. */
function lockScroll() {
  document.body.style.overflow = $$('.modal:not([hidden])').length ? 'hidden' : '';
}

/**
 * Ask before doing something destructive. Resolves true only if the
 * user confirms; false on cancel, Escape, or a backdrop click.
 *
 * A promise rather than a callback so the caller reads top-to-bottom:
 *   if (await confirmDialog({...})) await remove(id);
 */
export function confirmDialog({ title = 'Are you sure?', body, label = 'Delete' } = {}) {
  return new Promise((resolve) => {
    ensureConfirmDialog();
    const modal = $('#confirm-modal');

    $('#confirm-h').textContent = title;
    $('#confirm-body').innerHTML = body ?? '';
    const yes = $('#confirm-yes');
    yes.textContent = label;

    let settled = false;
    const done = (answer) => {
      if (settled) return;
      settled = true;
      yes.removeEventListener('click', onYes);
      modal.removeEventListener('click', onAny);
      document.removeEventListener('keydown', onKey, true);
      closeDialog('#confirm-modal');
      resolve(answer);
    };

    const onYes = () => done(true);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();        // don't let the sheet behind us close too
      done(false);
    };
    /* Covers the Cancel button and a backdrop click in one place,
       rather than duplicating initDialogs' logic. */
    const onAny = (e) => {
      if (e.target.closest('[data-close]') || e.target === modal) done(false);
    };

    yes.addEventListener('click', onYes);
    modal.addEventListener('click', onAny);
    /* Capture phase, so this runs before initDialogs' own Escape
       handler closes the sheet underneath. */
    document.addEventListener('keydown', onKey, true);

    openDialog('#confirm-modal');
    yes.focus();
  });
}

/** Build the paragraph a delete dialog usually needs. */
export function dangerBody(what, consequence) {
  return `Delete <b>${esc(what)}</b>?${consequence ? ` ${consequence}` : ''} ` +
         'This cannot be undone.';
}

/* ---------- selects --------------------------------------- */

/**
 * Fill a <select>. `blank` adds a leading empty option with that
 * label (pass null to omit it entirely).
 */
export function fillSelect(el, values, blank = null) {
  const target = typeof el === 'string' ? $(el) : el;
  if (!target) return;
  target.innerHTML =
    (blank ? `<option value="">${esc(blank)}</option>` : '') +
    values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

/* ---------- kanban ---------------------------------------- */

/**
 * Make a pipeline's cards draggable between columns, with a keyboard
 * equivalent (focus a card, press ← / →) so it isn't mouse-only.
 *
 * @param {Element} root       the .pipeline container
 * @param {string[]} statuses  column order, for the keyboard move
 * @param {(id, status) => void} onMove  called after the drop
 */
export function wirePipeline(root, statuses, onMove) {
  let dragged = null;

  $$('.card', root).forEach((card) => {
    card.addEventListener('dragstart', () => {
      dragged = card;
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      $$('.col', root).forEach((c) => c.classList.remove('over'));
    });
  });

  $$('.col', root).forEach((col) => {
    const body = $('.col-body', col);
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('over');
      if (!dragged) return;
      const id = dragged.dataset.id;
      dragged = null;
      onMove(id, body.dataset.drop);
    });
  });

  $$('.card', root).forEach((card) => {
    card.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const from = card.closest('.col')?.dataset.status;
      const i = statuses.indexOf(from);
      const next = statuses[i + (e.key === 'ArrowRight' ? 1 : -1)];
      if (i < 0 || !next) return;
      onMove(card.dataset.id, next);
      /* The card is re-rendered, so restore focus by id. */
      $(`.card[data-id="${card.dataset.id}"]`, root)?.focus();
    });
  });
}

/* ---------- pagination ------------------------------------ */

/* Latest onGo per pager element. The click listener is attached once,
   so it must read the current callback rather than close over the one
   from the first render. */
const pagerHandlers = new WeakMap();

/**
 * Render a pager into `el`. `onGo(page)` is called with the page the
 * user picked. Renders nothing when there's only one page.
 */
export function renderPager(el, page, total, perPage, onGo) {
  const target = typeof el === 'string' ? $(el) : el;
  if (!target) return;

  pagerHandlers.set(target, onGo);

  /* Delegated once, so re-rendering the buttons can't stack listeners. */
  if (!target.dataset.wired) {
    target.dataset.wired = '1';
    target.addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]');
      if (!b || b.disabled) return;
      pagerHandlers.get(target)?.(Number(b.dataset.page));
    });
  }

  const pages = Math.max(1, Math.ceil(total / perPage));
  if (pages <= 1) { target.innerHTML = ''; return; }

  const btn = (label, p, opts = {}) =>
    `<button ${opts.current ? 'aria-current="true"' : ''} ${opts.disabled ? 'disabled' : ''}
             data-page="${p}">${label}</button>`;

  const nums = [];
  const lo = Math.max(1, page - 2);
  const hi = Math.min(pages, lo + 4);
  for (let i = lo; i <= hi; i++) nums.push(btn(i, i, { current: i === page }));

  target.innerHTML =
    btn('‹', page - 1, { disabled: page === 1 }) +
    nums.join('') +
    btn('›', page + 1, { disabled: page === pages });
}

/* ---------- misc ------------------------------------------ */

/** Trailing-edge debounce, for search boxes. */
export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Two-letter initials from a name, for the avatar chips. */
export function initials(name) {
  const s = String(name || '').trim();
  if (!s) return '—';
  return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** Download a value as a file, via a temporary object URL. */
export function downloadCsv(filename, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = rows.map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' }));

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
