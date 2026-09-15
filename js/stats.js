// "Trees" tab: searchable list of verified sequoias (nearest first when we
// know where you are), the growth chart, and the signed-in user's own
// submissions with their review status.

import { ACCESS, STATUS } from './config.js';
import { esc, haversineM, fmtDistance, fmtDate } from './map.js';

let state = { verified: [], mine: [], userPos: null, query: '' };
let host = null, helpers = null;

export function mount(el, h) { host = el; helpers = h; }

export function update(patch) {
  state = { ...state, ...patch };
  if (host) render();
}

const monthKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const monthLabel = (k) => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, 1)
  .toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

function chartHtml(trees) {
  const dated = trees.filter(t => t.createdAt);
  if (dated.length < 2) return '';
  const counts = new Map();
  for (const t of dated) counts.set(monthKey(t.createdAt), (counts.get(monthKey(t.createdAt)) || 0) + 1);
  // Fill gaps so quiet months show as empty bars rather than vanishing.
  const keys = [...counts.keys()].sort();
  const first = new Date(+keys[0].slice(0, 4), +keys[0].slice(5, 7) - 1, 1);
  const last = new Date();
  const series = [];
  for (let d = first; d <= last; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const k = monthKey(d.getTime());
    series.push([k, counts.get(k) || 0]);
  }
  if (series.length > 24) series.splice(0, series.length - 24);
  const max = Math.max(...series.map(s => s[1]), 1);
  let running = dated.length - series.reduce((a, s) => a + s[1], 0);
  return `<div class="chart">
    <div class="chart__bars">${series.map(([k, n]) => {
      running += n;
      return `<div class="chart__col" title="${monthLabel(k)}: ${n} new, ${running} total">
        <div class="chart__bar" style="height:${Math.round(n / max * 100)}%"></div>
        <span class="chart__x">${monthLabel(k)}</span></div>`; }).join('')}
    </div>
    <p class="muted small">New verified trees per month, last ${series.length} months. Hover or tap a bar for the running total.</p>
  </div>`;
}

function treeRow(t, distM) {
  return `<li class="tree-row" data-uuid="${esc(t.uuid)}">
    ${t.photoUrl ? `<img src="${esc(t.photoUrl)}" alt="" loading="lazy">` : '<div class="tree-row__noimg">🌲</div>'}
    <div class="tree-row__main">
      <div class="tree-row__name">${esc(t.name || 'Unnamed sequoia')}</div>
      <div class="muted small">${esc(ACCESS[t.access] || '')}${t.treeCount > 1 ? ` · ${t.treeCount} trees` : ''}</div>
      <div class="muted small">${distM != null ? `${fmtDistance(distM)} away · ` : ''}${fmtDate(t.createdAt)}</div>
    </div>
    <span class="tree-row__go">›</span>
  </li>`;
}

function mineRow(t) {
  const badge = t.status === 'verified' ? 'ok' : t.status === 'rejected' ? 'bad' : 'pending';
  return `<li class="tree-row" data-uuid="${esc(t.uuid)}">
    ${t.photoUrl ? `<img src="${esc(t.photoUrl)}" alt="" loading="lazy">` : '<div class="tree-row__noimg">🌲</div>'}
    <div class="tree-row__main">
      <div class="tree-row__name">${esc(t.name || 'Unnamed sequoia')}</div>
      <div class="muted small">${fmtDate(t.createdAt)}${t.reviewNote && t.status === 'rejected' ? ` · ${esc(t.reviewNote)}` : ''}</div>
    </div>
    <span class="badge badge--${badge}">${STATUS[t.status] || t.status}</span>
  </li>`;
}

function render() {
  const { verified, mine, userPos, query } = state;
  const q = query.trim().toLowerCase();
  let list = verified.map(t => ({ t, d: userPos ? haversineM(userPos.lat, userPos.lon, t.lat, t.lon) : null }));
  if (q) list = list.filter(({ t }) => `${t.name} ${t.notes} ${t.contributor}`.toLowerCase().includes(q));
  list.sort((a, b) => userPos ? a.d - b.d : String(a.t.name).localeCompare(String(b.t.name)));
  const shown = list.slice(0, 200);
  const total = verified.reduce((a, t) => a + (t.treeCount || 1), 0);

  host.innerHTML = `
    <h2>Verified sequoias</h2>
    <p class="muted">${verified.length} location${verified.length === 1 ? '' : 's'}${total !== verified.length ? `, about ${total} trees` : ''} on the map.</p>
    ${chartHtml(verified)}
    <div class="row">
      <input type="search" id="tree-search" placeholder="Search by name or notes" value="${esc(query)}" style="flex:1">
      <button class="btn btn--sm" id="btn-sort-near" title="Sort by distance from me">${userPos ? '📍 Nearest first' : '📍 Near me'}</button>
    </div>
    <ul class="tree-list" id="tree-list">${shown.map(({ t, d }) => treeRow(t, d)).join('') ||
      `<li class="muted small">${verified.length ? 'No matches.' : 'No verified trees yet.'}</li>`}</ul>
    ${list.length > shown.length ? `<p class="muted small">Showing the first ${shown.length} of ${list.length}. Narrow the search or sort by distance.</p>` : ''}
    <div id="mine-block" ${mine.length ? '' : 'hidden'}>
      <h2 style="margin-top:22px">My submissions</h2>
      <p class="muted small">Pending trees appear on the map only for you, in grey, until an admin has checked them.</p>
      <ul class="tree-list">${mine.map(mineRow).join('')}</ul>
    </div>`;

  const search = host.querySelector('#tree-search');
  search.addEventListener('input', () => {
    state.query = search.value;
    // Re-render the list only, so the input keeps focus.
    const listEl = host.querySelector('#tree-list');
    const qq = state.query.trim().toLowerCase();
    let l = verified.map(t => ({ t, d: userPos ? haversineM(userPos.lat, userPos.lon, t.lat, t.lon) : null }));
    if (qq) l = l.filter(({ t }) => `${t.name} ${t.notes} ${t.contributor}`.toLowerCase().includes(qq));
    l.sort((a, b) => userPos ? a.d - b.d : String(a.t.name).localeCompare(String(b.t.name)));
    listEl.innerHTML = l.slice(0, 200).map(({ t, d }) => treeRow(t, d)).join('') || '<li class="muted small">No matches.</li>';
  });
  host.querySelector('#btn-sort-near').addEventListener('click', () => helpers.onLocate());
  host.addEventListener('click', (e) => {
    const row = e.target.closest('.tree-row');
    if (row) helpers.onShowOnMap(row.dataset.uuid);
  });
}
