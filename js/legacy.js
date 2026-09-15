// Reader for the original Google Form / Sheet data.
//
// Two jobs: feed the map while Firebase is switched off, and give the admin
// dashboard the rows it imports into Firestore. Nothing is written here.

import { LEGACY, ACCESS } from './config.js';

export const isConfigured = () => !!LEGACY.sheetCsvUrl;

// Minimal RFC-4180 parser: quoted fields, doubled quotes, CRLF. Enough for a
// Google Sheets export; avoids shipping PapaParse for one call.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map(h => h.trim());
  return rows
    .filter(r => r.some(v => v.trim() !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// Google Forms UK timestamp: "DD/MM/YYYY" or "DD/MM/YYYY HH:MM[:SS]".
export function parseTimestamp(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', se = '0'] = m;
  const t = new Date(+y, +mo - 1, +d, +h, +mi, +se).getTime();
  return Number.isFinite(t) ? t : null;
}

// Stable id per row so that importing twice updates rather than duplicates.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function pick(r, ...names) {
  for (const n of names) {
    const k = Object.keys(r).find(k => k.toLowerCase() === n.toLowerCase());
    if (k && r[k] !== '') return r[k];
  }
  return '';
}

function mapAccess(s) {
  const t = String(s || '').toLowerCase();
  if (!t) return 'unknown';
  if (t.includes('path') || t.includes('road') || t.includes('viewable') || t.includes('visible')) return 'path';
  if (t.includes('paid') || t.includes('ticket') || t.includes('trust')) return 'paid';
  if (t.includes('private')) return 'private';
  if (t.includes('public')) return 'public';
  return ACCESS[t] ? t : 'unknown';
}

function mapStatus(review, legacyStatus) {
  const r = String(review || '').toLowerCase().trim();
  if (r === 'approved' || r === 'verified') return 'verified';
  if (r === 'rejected') return 'rejected';
  if (String(legacyStatus || '').toLowerCase() === 'verified') return 'verified';
  return 'pending_review';
}

/** Convert one sheet row to the app's tree record. Returns null if no usable position. */
export function rowToTree(r) {
  const lat = Number(pick(r, 'lat', 'latitude'));
  const lon = Number(pick(r, 'lng', 'lon', 'longitude'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const ts = pick(r, 'timestamp');
  const name = pick(r, 'name', 'Tree name / label', 'Tree name') || 'Unnamed sequoia';
  const links = pick(r, 'photo', 'photo_url', 'Photo URL')
    .split(/[\s,]+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));

  return {
    uuid: 'sheet-' + fnv1a(`${ts}|${lat}|${lon}|${name}`),
    lat, lon,
    name,
    access: mapAccess(pick(r, 'access')),
    notes: pick(r, 'notes', 'Notes/ how to find it', 'Notes / how to find it'),
    treeCount: 1,
    girthCm: null, heightM: null, condition: null,
    photoUrls: [],            // Drive links are not embeddable images...
    photoLinks: links,        // ...so keep them as plain links
    contributor: pick(r, 'Email or reviewer name- add if you\'d like to stay in touch/ be credited for your tree', 'contributor', 'credit'),
    reviewNote: pick(r, 'review_notes', 'review_noes', 'review note'),
    status: mapStatus(pick(r, 'review_status', 'Review status'), pick(r, 'status')),
    createdAt: parseTimestamp(ts) ?? Date.now(),
    source: 'sheet',
  };
}

/** Fetch every row of the published sheet as tree records (all statuses). */
export async function fetchTrees() {
  if (!isConfigured()) return [];
  const url = LEGACY.sheetCsvUrl + (LEGACY.sheetCsvUrl.includes('?') ? '&' : '?') + 'v=' + Date.now();
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheet returned ${res.status}`);
  return parseCsv(await res.text()).map(rowToTree).filter(Boolean);
}
