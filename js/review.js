// Admin review dashboard: one card per pending tree with everything needed
// for a verdict in view, plus the one-off Google Sheet import, a rejected
// list with "restore", and a CSV export of the whole collection.
//
// All real reads/writes go through cloud.js and are gated by the Firestore
// rules, not by this UI.

import { ACCESS, CONDITION, STATUS } from './config.js';
import * as Cloud from './cloud.js';
import * as Legacy from './legacy.js';
import { esc, fmtDate } from './map.js';

const fmtWhen = (t) => t ? new Date(t).toLocaleString('en-GB',
  { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '?';

const options = (vocab, current, allowEmpty) =>
  (allowEmpty ? `<option value="">—</option>` : '') +
  Object.entries(vocab).map(([k, v]) =>
    `<option value="${k}" ${k === current ? 'selected' : ''}>${esc(v)}</option>`).join('');

function photosHtml(r) {
  const urls = (r.photoUrls || []).length ? r.photoUrls : (r.photoUrl ? [r.photoUrl] : []);
  if (urls.length) {
    return `<a href="${esc(urls[0])}" target="_blank" rel="noopener"><img src="${esc(urls[0])}" alt="Submitted photo" loading="lazy"></a>
      ${urls.length > 1 ? `<div class="more">${urls.slice(1).map(u =>
        `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}`;
  }
  if ((r.photoLinks || []).length) {
    return `<div class="review-card__nophoto">${r.photoLinks.map((u, i) =>
      `<a href="${esc(u)}" target="_blank" rel="noopener">Photo ${i + 1} ↗</a>`).join('<br>')}</div>`;
  }
  return '<div class="review-card__nophoto">no photo</div>';
}

function card(r, { onShowOnMap, onDecide, mode }) {
  const el = document.createElement('div');
  el.className = 'review-card';
  el.innerHTML = `
    <div class="review-card__photo">${photosHtml(r)}</div>
    <div class="review-card__body">
      <label class="field field--tight"><span>Name / label</span>
        <input type="text" data-f="name" maxlength="120" value="${esc(r.name)}"></label>
      <label class="field field--tight"><span>Access</span>
        <select data-f="access">${options(ACCESS, r.access)}</select></label>
      <label class="field field--tight"><span>Notes</span>
        <textarea data-f="notes" rows="2" maxlength="1000">${esc(r.notes || '')}</textarea></label>
      <div class="review-card__facts muted small">
        ${r.treeCount > 1 ? `${r.treeCount} trees · ` : ''}
        ${r.girthCm ? `girth ${r.girthCm} cm · ` : ''}
        ${r.heightM ? `~${r.heightM} m · ` : ''}
        ${r.condition ? `${esc(CONDITION[r.condition] || r.condition)} · ` : ''}
        ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}${r.accuracyM != null ? ` (±${Math.round(r.accuracyM)} m)` : ''}
      </div>
      <div class="muted small">
        ${r.contributor ? `Credit: ${esc(r.contributor)} · ` : ''}
        ${r.source === 'sheet' ? 'Imported from sheet · ' : ''}
        submitted ${fmtWhen(r.createdAt)}
        ${r.reviewedAt ? ` · reviewed ${fmtWhen(r.reviewedAt)}` : ''}
      </div>
      ${r.reviewNote ? `<div class="muted small">Review note: ${esc(r.reviewNote)}</div>` : ''}
      <label class="field field--tight"><span>Review note (optional, kept private)</span>
        <input type="text" data-f="reviewNote" maxlength="500" value="${esc(r.reviewNote || '')}" placeholder="e.g. checked on Street View"></label>
      <div class="review-card__actions">
        <button class="btn btn--sm" data-act="map">Map</button>
        <a class="btn btn--sm" target="_blank" rel="noopener"
           href="https://www.google.com/maps/search/?api=1&query=${r.lat.toFixed(6)},${r.lon.toFixed(6)}">Google Maps ↗</a>
        ${mode === 'pending' ? `
          <button class="btn btn--sm" data-act="rejected">Reject</button>
          <button class="btn btn--sm btn--primary" data-act="verified">Approve</button>` : ''}
        ${mode === 'rejected' ? `
          <button class="btn btn--sm" data-act="pending_review">Restore to queue</button>
          <button class="btn btn--sm btn--danger" data-act="delete">Delete</button>` : ''}
        ${mode === 'verified' ? `
          <button class="btn btn--sm" data-act="save">Save edits</button>
          <button class="btn btn--sm" data-act="pending_review">Un-verify</button>` : ''}
      </div>
    </div>`;

  const fields = () => ({
    name: el.querySelector('[data-f="name"]').value.trim() || r.name,
    access: el.querySelector('[data-f="access"]').value,
    notes: el.querySelector('[data-f="notes"]').value.trim(),
  });
  const note = () => el.querySelector('[data-f="reviewNote"]').value.trim();

  el.querySelector('[data-act="map"]').addEventListener('click', () => onShowOnMap(r));
  el.querySelectorAll('[data-act]').forEach((btn) => {
    const act = btn.dataset.act;
    if (act === 'map') return;
    btn.addEventListener('click', async () => {
      if (act === 'delete' && !confirm(`Delete "${r.name}" permanently? The photo stays in Storage until you remove it in the console.`)) return;
      const btns = el.querySelectorAll('button');
      btns.forEach(b => { b.disabled = true; });
      try {
        await onDecide(r, act, { fields: fields(), note: note() });
        if (act === 'save') { btns.forEach(b => { b.disabled = false; }); return; }
        el.classList.add(act === 'verified' ? 'is-approved' : 'is-rejected');
        setTimeout(() => el.remove(), 350);
      } catch (err) {
        btns.forEach(b => { b.disabled = false; });
        throw err;
      }
    });
  });
  return el;
}

function renderList(host, records, mode, helpers) {
  host.innerHTML = '';
  if (!records.length) {
    host.innerHTML = `<p class="muted">${mode === 'pending' ? 'Nothing waiting for review. ✓' : 'Nothing here.'}</p>`;
    return;
  }
  records.sort((a, b) => (mode === 'pending' ? (a.createdAt || 0) - (b.createdAt || 0)
                                             : (b.reviewedAt || b.createdAt || 0) - (a.reviewedAt || a.createdAt || 0)));
  for (const r of records) host.appendChild(card(r, { ...helpers, mode }));
}

function toCsv(rows) {
  const cols = ['uuid', 'status', 'name', 'lat', 'lon', 'accuracyM', 'access', 'treeCount', 'girthCm', 'heightM',
    'condition', 'notes', 'contributor', 'photoUrls', 'photoLinks', 'source', 'createdAt', 'reviewedAt', 'reviewNote'];
  const cell = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) v = v.join(' ');
    if (typeof v === 'number' && v > 1e11) v = new Date(v).toISOString();
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
}

/** Build the dashboard into `host`. helpers: { onShowOnMap(tree), onChanged(), toast(msg) } */
export async function open(host, helpers) {
  host.innerHTML = '<p class="muted">Loading…</p>';
  const [pending, counts] = await Promise.all([Cloud.fetchByStatus('pending_review'), Cloud.counts()]);

  host.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${counts.pending_review}</b><span>pending</span></div>
      <div class="stat"><b>${counts.verified}</b><span>verified</span></div>
      <div class="stat"><b>${counts.rejected}</b><span>rejected</span></div>
    </div>
    <div class="row">
      <button class="btn btn--sm" data-act="reload">Reload</button>
      <button class="btn btn--sm" data-act="export">Export all as CSV</button>
      ${Legacy.isConfigured() ? '<button class="btn btn--sm" data-act="import">Import from Google Sheet</button>' : ''}
    </div>
    <p class="muted small" id="review-msg"></p>
    <h3>Waiting for review</h3>
    <div id="review-pending"></div>
    <details class="review-more"><summary>Verified trees (edit)</summary><div id="review-verified"><p class="muted small">Open to load.</p></div></details>
    <details class="review-more"><summary>Rejected</summary><div id="review-rejected"><p class="muted small">Open to load.</p></div></details>`;

  const msg = host.querySelector('#review-msg');
  const say = (t) => { msg.textContent = t; };

  const onDecide = async (r, act, { fields, note }) => {
    if (act === 'save') { await Cloud.updateTree(r.uuid, fields); helpers.toast('Saved'); }
    else if (act === 'delete') { await Cloud.deleteTree(r.uuid); helpers.toast('Deleted'); }
    else { await Cloud.review(r.uuid, act, { note, fields }); helpers.toast(`${fields.name}: ${STATUS[act].toLowerCase()}`); }
    helpers.onChanged && helpers.onChanged();
  };
  const listHelpers = { onShowOnMap: helpers.onShowOnMap, onDecide };

  renderList(host.querySelector('#review-pending'), pending, 'pending', listHelpers);

  for (const [status, mode] of [['verified', 'verified'], ['rejected', 'rejected']]) {
    const det = host.querySelector(`#review-${mode}`).parentElement;
    det.addEventListener('toggle', async () => {
      if (!det.open) return;
      const box = det.querySelector('div');
      box.innerHTML = '<p class="muted small">Loading…</p>';
      try { renderList(box, await Cloud.fetchByStatus(status, 500), mode, listHelpers); }
      catch (err) { box.innerHTML = `<p class="form-error">${esc(err.message)}</p>`; }
    });
  }

  host.querySelector('[data-act="reload"]').addEventListener('click', () => open(host, helpers));

  host.querySelector('[data-act="export"]').addEventListener('click', async () => {
    say('Preparing CSV…');
    try {
      const all = await Cloud.fetchAll();
      const blob = new Blob([toCsv(all)], { type: 'text/csv' });
      const a = Object.assign(document.createElement('a'), {
        href: URL.createObjectURL(blob), download: `sequoia-trees-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      say(`Exported ${all.length} trees.`);
    } catch (err) { say(err.message); }
  });

  const imp = host.querySelector('[data-act="import"]');
  if (imp) imp.addEventListener('click', async () => {
    imp.disabled = true;
    try {
      say('Reading the Google Sheet…');
      const rows = await Legacy.fetchTrees();
      if (!rows.length) { say('The sheet has no rows with a position.'); return; }
      const n = { verified: 0, pending_review: 0, rejected: 0 };
      rows.forEach(r => { n[r.status] = (n[r.status] || 0) + 1; });
      if (!confirm(`Import ${rows.length} rows from the sheet?\n${n.verified} approved, ${n.pending_review} pending, ${n.rejected} rejected.\n\nRows already imported are skipped, so this is safe to run again.`)) { say(''); return; }
      const res = await Cloud.importLegacy(rows, ({ done, total }) => say(`Importing ${done} / ${total}…`));
      say(`Import finished: ${res.created} added, ${res.skipped} already present, ${res.failed} failed${res.firstError ? ` (${res.firstError})` : ''}.`);
      helpers.onChanged && helpers.onChanged();
      if (res.created) setTimeout(() => open(host, helpers), 1200);
    } catch (err) { say(`Import failed: ${err.message}`); }
    finally { imp.disabled = false; }
  });

  return pending.length;
}
