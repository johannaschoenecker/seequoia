// Se(e)quoia controller: tabs, data loading, sign-in, the add-a-tree flow,
// the offline outbox, and the admin review tab.

import { ACCESS, CONDITION, MAP as MAPCFG, QUALITY } from './config.js';
import * as Cloud from './cloud.js';
import * as Legacy from './legacy.js';
import * as Map from './map.js';
import * as Outbox from './outbox.js';
import * as Photo from './photo.js';
import * as Review from './review.js';
import * as Stats from './stats.js';
import * as Info from './info.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const state = {
  user: null,
  isAdmin: false,
  verified: [],
  mine: [],
  photos: [],          // Blobs staged for the open form
  pick: null,          // { lat, lon } chosen on the map
  firstFit: true,
};

// ══════════════════════════════════════════════════════════ ui helpers
let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const errMsg = (err) => (err && (err.message || err.code)) ? String(err.message || err.code) : String(err);

function showTab(v) {
  $$('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('is-active', s.id === `view-${v}`));
  if (v === 'map') Map.invalidate();
  if (v === 'review') openReview();
}

function fillSelect(sel, vocab, { empty } = {}) {
  sel.innerHTML = (empty ? `<option value="">${empty}</option>` : '') +
    Object.entries(vocab).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
}

// ══════════════════════════════════════════════════════════ data
async function loadTrees() {
  const status = $('#map-status');
  if (Cloud.isEnabled()) {
    try {
      await Cloud.watchVerified((list, fromCache) => {
        state.verified = list;
        Map.setTrees(list, { fit: state.firstFit && list.length > 0 });
        if (list.length) state.firstFit = false;
        Stats.update({ verified: list });
        status.textContent = `${list.length} verified sequoia${list.length === 1 ? '' : 's'}${fromCache ? ' (cached)' : ''}`;
      }, (err) => { status.textContent = 'Could not load trees'; console.warn(err); });
    } catch (err) {
      status.textContent = 'Could not connect to the database';
      console.warn(err);
    }
  } else {
    // Firebase not configured yet: read the original Google Sheet.
    try {
      const all = await Legacy.fetchTrees();
      const list = all.filter(t => t.status === 'verified');
      state.verified = list;
      Map.setTrees(list, { fit: true });
      Stats.update({ verified: list });
      status.textContent = `${list.length} verified sequoia${list.length === 1 ? '' : 's'} (from the sheet)`;
    } catch (err) {
      status.textContent = 'Could not load trees';
      console.warn(err);
    }
  }
}

async function refreshMine() {
  if (!state.user) { state.mine = []; Map.setMine([]); Stats.update({ mine: [] }); return; }
  try {
    state.mine = await Cloud.fetchMine();
    Map.setMine(state.mine);
    Stats.update({ mine: state.mine });
  } catch (err) { console.warn('fetchMine', err); }
}

// ══════════════════════════════════════════════════════════ auth
function setUser(u) {
  state.user = u;
  const pill = $('#account-pill');
  if (u) {
    pill.textContent = (u.displayName || u.email || 'Account').split(' ')[0];
    pill.title = `Signed in as ${u.email || ''}. Tap to sign out.`;
  } else {
    pill.textContent = 'Sign in';
    pill.title = 'Sign in with Google to add trees';
  }
  state.isAdmin = false;
  $('#tab-review').hidden = true;
  if (u) {
    Cloud.isAdminUser().then((ok) => { state.isAdmin = ok; $('#tab-review').hidden = !ok; }).catch(() => {});
  }
  refreshMine();
  flushOutbox();
}

async function ensureSignedIn() {
  if (state.user) return state.user;
  const u = await Cloud.signIn();   // null => page is redirecting
  if (u) setUser(u);
  return u;
}

// ══════════════════════════════════════════════════════════ add-a-tree flow
function enterPickMode() {
  if (!Cloud.isEnabled()) { toast('Adding trees opens once the database is connected.'); return; }
  showTab('map');
  $('#pick-bar').hidden = false;
  $('#pick-continue').disabled = !state.pick;
  Map.enterPick((p) => {
    state.pick = p;
    $('#pick-coords').textContent = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} — drag the pin to fine-tune.`;
    $('#pick-continue').disabled = false;
  }, state.pick);
  // Quietly centre on the user; a refusal is fine, they can pan.
  if (!state.pick) Map.locate().catch(() => {});
}

function exitPickMode({ keep = false } = {}) {
  $('#pick-bar').hidden = true;
  if (!keep) { Map.exitPick(); state.pick = null; $('#pick-coords').textContent = 'Drag the pin to fine-tune.'; }
  else Map.exitPick();
}

function openForm() {
  if (!state.pick) { toast('Tap the map to place the tree first.'); return; }
  $('#pick-bar').hidden = true;
  $('#loc-coords').textContent = `${state.pick.lat.toFixed(5)}, ${state.pick.lon.toFixed(5)}`;
  $('#form-error').hidden = true;
  $('#f-contributor').value = localStorage.getItem('sequoia.contributor') || '';
  $('#tree-dialog').showModal();
}

function closeForm() {
  $('#tree-dialog').close();
  exitPickMode();
  state.photos = [];
  renderPhotoPreviews();
  $('#tree-form').reset();
  $('#f-count').value = 1;
}

function renderPhotoPreviews() {
  const host = $('#photo-previews');
  host.innerHTML = '';
  state.photos.forEach((blob, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'ph';
    const img = document.createElement('img');
    img.src = URL.createObjectURL(blob);
    img.onload = () => URL.revokeObjectURL(img.src);
    const rm = document.createElement('button');
    rm.type = 'button'; rm.textContent = '✕'; rm.title = 'Remove';
    rm.addEventListener('click', () => { state.photos.splice(i, 1); renderPhotoPreviews(); });
    wrap.append(img, rm);
    host.appendChild(wrap);
  });
}

async function onPhotosChosen(e) {
  const files = Array.from(e.target.files || []);
  e.target.value = '';
  for (const f of files) {
    if (state.photos.length >= QUALITY.maxPhotos) { toast(`Up to ${QUALITY.maxPhotos} photos per tree.`); break; }
    try { state.photos.push(await Photo.shrink(f)); }
    catch (err) { toast(errMsg(err)); }
  }
  renderPhotoPreviews();
}

function showErr(msg) { const el = $('#form-error'); el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'nearest' }); }

function numOrNull(sel, lo, hi) {
  const v = $(sel).value.trim();
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`Please enter a number between ${lo} and ${hi}.`);
  return n;
}

async function saveTree() {
  $('#form-error').hidden = true;
  const p = state.pick;
  if (!p) return showErr('Place the tree on the map first.');
  const { uk } = MAPCFG;
  if (p.lat < uk.latMin || p.lat > uk.latMax || p.lon < uk.lonMin || p.lon > uk.lonMax)
    return showErr('This map only accepts trees in the UK and Ireland. Move the pin.');
  const name = $('#f-name').value.trim();
  if (!name) return showErr('Please give the tree a name or label.');
  const access = $('#f-access').value;
  if (!access) return showErr('Please say how people can get to the tree.');

  let treeCount, girthCm, heightM;
  try {
    treeCount = numOrNull('#f-count', 1, QUALITY.maxTreeCount) ?? 1;
    girthCm = numOrNull('#f-girth', 0, QUALITY.maxGirthCm);
    heightM = numOrNull('#f-height', 0, QUALITY.maxHeightM);
  } catch (err) { return showErr(errMsg(err)); }

  const contributor = $('#f-contributor').value.trim();
  localStorage.setItem('sequoia.contributor', contributor);

  const record = {
    uuid: crypto.randomUUID(),
    lat: p.lat, lon: p.lon,
    name, access,
    notes: $('#f-notes').value.trim(),
    treeCount, girthCm, heightM,
    condition: $('#f-condition').value || null,
    contributor,
    createdAt: Date.now(),
  };

  const btn = $('#form-save');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    // Persist first: if sign-in has to redirect, nothing is lost.
    await Outbox.put({ uuid: record.uuid, record, photos: state.photos.slice(), createdAt: record.createdAt });
    closeForm();
    const u = await ensureSignedIn();
    if (!u) return;                     // redirecting to Google; outbox flushes on return
    await flushOutbox();
  } catch (err) {
    toast(`Saved on this device. ${errMsg(err)}`, 4000);
    updateOutboxPill();
  } finally {
    btn.disabled = false; btn.textContent = 'Submit tree';
  }
}

// ══════════════════════════════════════════════════════════ outbox
let flushing = false;
async function updateOutboxPill() {
  const pill = $('#outbox-pill');
  const items = await Outbox.all().catch(() => []);
  if (!items.length) { pill.hidden = true; return; }
  pill.hidden = false;
  pill.textContent = state.user
    ? `${items.length} to upload · retry`
    : `${items.length} to upload · sign in`;
}

async function flushOutbox() {
  if (!Cloud.isEnabled() || flushing) return;
  flushing = true;
  try {
    const items = await Outbox.all();
    if (!items.length) return;
    if (!state.user) return;
    let ok = 0, failed = 0, firstError = null;
    for (const item of items) {
      try {
        await Cloud.submitTree(item.record, item.photos || [], (msg) => toast(msg, 8000));
        await Outbox.remove(item.uuid);
        ok++;
      } catch (err) {
        failed++;
        if (!firstError) firstError = errMsg(err);
        item.lastError = errMsg(err);
        await Outbox.put(item).catch(() => {});
        console.warn('submit failed', item.uuid, err);
      }
    }
    if (ok) {
      toast(ok === 1 ? 'Tree submitted — thank you! It will appear once reviewed.' : `${ok} trees submitted — thank you!`, 3500);
      refreshMine();
    }
    if (failed) toast(`${failed} submission${failed > 1 ? 's' : ''} could not be uploaded (${firstError}). Kept on this device; tap the yellow pill to retry.`, 6000);
  } finally {
    flushing = false;
    updateOutboxPill();
  }
}

// ══════════════════════════════════════════════════════════ review (admin)
async function openReview() {
  const host = $('#review-list');
  try {
    await Review.open(host, {
      toast,
      onChanged: () => refreshMine(),
      onShowOnMap: (t) => {
        showTab('map');
        if (!Map.focus(t.uuid)) Map.highlight(t);
      },
    });
  } catch (err) {
    host.innerHTML = `<p class="form-error">${errMsg(err)}</p><p class="muted small">Sign in with an admin account. If you are one, reload the page and try again.</p>`;
  }
}

// ══════════════════════════════════════════════════════════ boot
function wire() {
  $$('.tab').forEach(b => b.addEventListener('click', () => showTab(b.dataset.view)));

  fillSelect($('#f-access'), ACCESS, { empty: 'Choose one…' });
  fillSelect($('#f-condition'), CONDITION, { empty: '—' });
  $('#info-pane').innerHTML = Info.html();

  Stats.mount($('#stats-pane'), {
    onShowOnMap: (uuid) => { showTab('map'); Map.focus(uuid); },
    onLocate: async () => {
      try { const fix = await Map.getPosition(); Stats.update({ userPos: fix }); }
      catch (err) { toast(errMsg(err)); }
    },
  });

  $('#btn-locate').addEventListener('click', async () => {
    try { const fix = await Map.locate(); Stats.update({ userPos: fix }); }
    catch (err) { toast(errMsg(err)); }
  });
  $('#btn-nearest').addEventListener('click', async () => {
    try {
      const { tree, distM } = await Map.nearest();
      toast(`Nearest: ${tree.name} (${Map.fmtDistance(distM)})`, 3500);
    } catch (err) { toast(errMsg(err)); }
  });
  $('#btn-add').addEventListener('click', enterPickMode);
  $('#pick-cancel').addEventListener('click', () => exitPickMode());
  $('#pick-here').addEventListener('click', async () => {
    try {
      const fix = await Map.getPosition();
      Map.enterPick((p) => {
        state.pick = p;
        $('#pick-coords').textContent = `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} (±${Math.round(fix.accuracyM || 0)} m) — drag the pin to fine-tune.`;
        $('#pick-continue').disabled = false;
      }, { lat: fix.lat, lon: fix.lon });
    } catch (err) { toast(errMsg(err)); }
  });
  $('#pick-continue').addEventListener('click', openForm);

  $('#form-close').addEventListener('click', closeForm);
  $('#form-cancel').addEventListener('click', closeForm);
  $('#tree-dialog').addEventListener('cancel', (e) => { e.preventDefault(); closeForm(); });
  $('#btn-change-loc').addEventListener('click', () => { $('#tree-dialog').close(); enterPickMode(); });
  $('#f-photo').addEventListener('change', onPhotosChosen);
  $('#form-save').addEventListener('click', saveTree);

  $('#account-pill').addEventListener('click', async () => {
    try {
      if (state.user) {
        if (confirm(`Sign out of ${state.user.email || 'this account'}?`)) { await Cloud.signOut(); setUser(null); }
      } else {
        await ensureSignedIn();
      }
    } catch (err) { toast(errMsg(err), 4000); }
  });
  $('#outbox-pill').addEventListener('click', async () => {
    try { await ensureSignedIn(); await flushOutbox(); }
    catch (err) { toast(errMsg(err), 4000); }
  });

  const net = $('#net-pill');
  const setNet = () => { net.hidden = navigator.onLine; net.dataset.state = navigator.onLine ? 'online' : 'offline'; };
  window.addEventListener('online', () => { setNet(); flushOutbox(); });
  window.addEventListener('offline', setNet);
  setNet();
}

async function boot() {
  Map.init($('#map'));
  wire();
  loadTrees();
  updateOutboxPill();

  if (Cloud.isEnabled()) {
    $('#account-pill').hidden = false;
    try {
      const u = await Cloud.completeRedirect();
      if (u) setUser(u);
      await Cloud.onUserChanged((user) => setUser(user));
    } catch (err) {
      console.warn('auth init', err);
      toast('Could not reach the sign-in service.', 4000);
    }
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
