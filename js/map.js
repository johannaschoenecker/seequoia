// Leaflet map: basemaps, clustered tree markers, locate / nearest, and the
// "tap to place" picker used when adding a tree.

import { MAP, BASEMAPS, ACCESS, CONDITION } from './config.js';

let map = null;
let cluster = null;         // verified trees
let mineLayer = null;       // the signed-in user's own (pending / rejected) trees
let userMarker = null;
let accuracyCircle = null;
let nearestLine = null;
let pickMarker = null;
let pickCb = null;
let trees = [];             // verified, as rendered
const byId = new Map();     // uuid -> marker

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function fmtDistance(m) {
  if (!Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export const fmtDate = (t) => t ? new Date(t).toLocaleDateString('en-GB',
  { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const icons = {};
function icon(kind) {
  if (!icons[kind]) {
    icons[kind] = L.icon({
      iconUrl: kind === 'verified' ? 'icons/sequoia-marker.png' : 'icons/sequoia-marker-grey.png',
      iconSize: [32, 46], iconAnchor: [16, 44], popupAnchor: [0, -40],
    });
  }
  return icons[kind];
}

export function popupHtml(t, opts = {}) {
  const photos = (t.photoUrls || []).length ? t.photoUrls : (t.photoUrl ? [t.photoUrl] : []);
  const photoHtml = photos.length
    ? `<div class="pop__photos">${photos.map(u =>
        `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="" loading="lazy"></a>`).join('')}</div>`
    : '';
  const links = (t.photoLinks || []).length
    ? `<div class="pop__links">${t.photoLinks.map((u, i) =>
        `<a href="${esc(u)}" target="_blank" rel="noopener">Photo ${i + 1}</a>`).join(' · ')}</div>`
    : '';
  const facts = [];
  if (t.treeCount > 1) facts.push(`${t.treeCount} trees`);
  if (t.girthCm) facts.push(`girth ${Math.round(t.girthCm)} cm`);
  if (t.heightM) facts.push(`~${Math.round(t.heightM)} m tall`);
  if (t.condition && t.condition !== 'unknown') facts.push(CONDITION[t.condition] || t.condition);
  const status = t.status === 'verified' ? '' :
    `<div class="pop__status badge badge--${t.status === 'rejected' ? 'bad' : 'pending'}">${
      t.status === 'rejected' ? 'Not accepted' : 'Pending review'}</div>`;
  const dir = `https://www.google.com/maps/dir/?api=1&destination=${t.lat.toFixed(6)},${t.lon.toFixed(6)}&travelmode=walking`;
  return `<div class="pop">
    <div class="pop__name">${esc(t.name || 'Unnamed sequoia')}</div>
    ${status}
    <div class="pop__meta">${esc(ACCESS[t.access] || 'Access unknown')}</div>
    ${facts.length ? `<div class="pop__meta">${esc(facts.join(' · '))}</div>` : ''}
    ${t.notes ? `<div class="pop__notes">${esc(t.notes)}</div>` : ''}
    ${photoHtml}${links}
    <div class="pop__foot">
      ${t.contributor ? `<span>Found by ${esc(t.contributor)}</span> · ` : ''}
      <span>${fmtDate(t.createdAt)}</span>
      ${opts.distM != null ? ` · <span>${fmtDistance(opts.distM)} away</span>` : ''}
    </div>
    <a class="pop__dir" href="${dir}" target="_blank" rel="noopener">Directions ↗</a>
  </div>`;
}

export function init(el) {
  map = L.map(el, { zoomControl: false, attributionControl: true })
    .setView(MAP.center, MAP.zoom);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);

  const layers = {};
  for (const [k, b] of Object.entries(BASEMAPS)) {
    layers[b.label] = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: b.maxZoom });
  }
  layers[Object.values(BASEMAPS)[0].label].addTo(map);

  cluster = L.markerClusterGroup({
    maxClusterRadius: 44, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 16,
  }).addTo(map);
  mineLayer = L.layerGroup().addTo(map);

  L.control.layers(layers, { 'Verified sequoias': cluster, 'My submissions': mineLayer },
    { position: 'topright', collapsed: true }).addTo(map);

  map.on('click', (e) => { if (pickCb) placePick(e.latlng.lat, e.latlng.lng); });
  return map;
}

export const invalidate = () => map && setTimeout(() => map.invalidateSize(), 60);

/** Render verified trees. Fits the view on first load only. */
export function setTrees(list, { fit = false } = {}) {
  trees = list.slice();
  cluster.clearLayers();
  byId.clear();
  for (const t of trees) {
    const m = L.marker([t.lat, t.lon], { icon: icon('verified'), title: t.name || '' })
      .bindPopup(() => popupHtml(t, { distM: distFromUser(t) }), { maxWidth: 280 });
    cluster.addLayer(m);
    byId.set(t.uuid, m);
  }
  if (fit && trees.length) {
    try { map.fitBounds(cluster.getBounds().pad(0.15), { maxZoom: 14 }); } catch {}
  }
}

/** The signed-in user's own unverified trees, in grey. */
export function setMine(list) {
  mineLayer.clearLayers();
  for (const t of list) {
    if (t.status === 'verified') continue;
    const m = L.marker([t.lat, t.lon], { icon: icon('mine'), title: t.name || '', opacity: 0.85 })
      .bindPopup(() => popupHtml(t), { maxWidth: 280 });
    mineLayer.addLayer(m);
    byId.set(t.uuid, m);
  }
}

export function focus(uuid) {
  const m = byId.get(uuid);
  if (!m) return false;
  const ll = m.getLatLng();
  map.flyTo(ll, Math.max(map.getZoom(), 17), { duration: 0.8 });
  const open = () => { if (cluster.hasLayer(m)) cluster.zoomToShowLayer(m, () => m.openPopup()); else m.openPopup(); };
  map.once('moveend', open);
  return true;
}

export function flyTo(lat, lon, zoom = 17) { map.flyTo([lat, lon], zoom, { duration: 0.8 }); }

/** Show a tree that is not on any layer (e.g. a pending one from the review queue). */
let tempMarker = null;
export function highlight(t) {
  if (tempMarker) map.removeLayer(tempMarker);
  tempMarker = L.marker([t.lat, t.lon], { icon: icon('mine'), zIndexOffset: 900 })
    .bindPopup(() => popupHtml(t), { maxWidth: 280 }).addTo(map);
  map.flyTo([t.lat, t.lon], 18, { duration: 0.8 });
  map.once('moveend', () => tempMarker && tempMarker.openPopup());
}

// ── location ──────────────────────────────────────────────────────────────
let lastFix = null;
export const lastPosition = () => lastFix;

function distFromUser(t) {
  return lastFix ? haversineM(lastFix.lat, lastFix.lon, t.lat, t.lon) : null;
}

export function getPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Location is not available in this browser'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        lastFix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracyM: p.coords.accuracy };
        showUser(lastFix);
        resolve(lastFix);
      },
      (err) => reject(new Error(err.code === 1
        ? 'Location access was refused. Allow it in your browser settings and try again.'
        : 'Could not get your location.')),
      { enableHighAccuracy: true, timeout, maximumAge: 15000 }
    );
  });
}

function showUser(fix) {
  const ll = [fix.lat, fix.lon];
  if (!userMarker) {
    userMarker = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#1D6FE0', fillOpacity: 1 }).addTo(map);
    accuracyCircle = L.circle(ll, { radius: fix.accuracyM || 0, color: '#1D6FE0', weight: 1, fillOpacity: 0.08 }).addTo(map);
  } else {
    userMarker.setLatLng(ll);
    accuracyCircle.setLatLng(ll).setRadius(fix.accuracyM || 0);
  }
}

export async function locate() {
  const fix = await getPosition();
  map.flyTo([fix.lat, fix.lon], Math.max(map.getZoom(), 15), { duration: 0.8 });
  return fix;
}

/** Find the nearest verified tree to the user, draw a line to it, open it. */
export async function nearest() {
  if (!trees.length) throw new Error('No trees loaded yet');
  const fix = await getPosition();
  let best = null, bestD = Infinity;
  for (const t of trees) {
    const d = haversineM(fix.lat, fix.lon, t.lat, t.lon);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (nearestLine) map.removeLayer(nearestLine);
  nearestLine = L.polyline([[fix.lat, fix.lon], [best.lat, best.lon]],
    { color: '#1D6FE0', weight: 3, dashArray: '6 6' }).addTo(map);
  map.fitBounds(L.latLngBounds([[fix.lat, fix.lon], [best.lat, best.lon]]).pad(0.3));
  const m = byId.get(best.uuid);
  map.once('moveend', () => { if (m) cluster.zoomToShowLayer(m, () => m.openPopup()); });
  return { tree: best, distM: bestD };
}

// ── pick mode (adding a tree) ─────────────────────────────────────────────
function placePick(lat, lon) {
  if (!pickMarker) {
    pickMarker = L.marker([lat, lon], { draggable: true, icon: icon('mine'), zIndexOffset: 1000 }).addTo(map);
    pickMarker.on('dragend', () => { const p = pickMarker.getLatLng(); pickCb && pickCb({ lat: p.lat, lon: p.lng }); });
  } else pickMarker.setLatLng([lat, lon]);
  pickCb && pickCb({ lat, lon });
}

/** Start pick mode. cb({lat, lon}) fires on every tap or drag. */
export function enterPick(cb, start) {
  pickCb = cb;
  map.closePopup();
  map.getContainer().classList.add('is-picking');
  if (start) { placePick(start.lat, start.lon); map.flyTo([start.lat, start.lon], Math.max(map.getZoom(), 17)); }
}

export function exitPick() {
  pickCb = null;
  map.getContainer().classList.remove('is-picking');
  if (pickMarker) { map.removeLayer(pickMarker); pickMarker = null; }
}

export function getPick() {
  if (!pickMarker) return null;
  const p = pickMarker.getLatLng();
  return { lat: p.lat, lon: p.lng };
}

export const verifiedTrees = () => trees;
