// Firebase layer: auth, Firestore and Storage. Lazy-loaded, so the map works
// (from the legacy sheet) even before Firebase is configured.
//
// Every read and write here is ultimately gated by firestore.rules and
// storage.rules, not by this file.

import { FIREBASE } from './config.js';

// Keep in step with the version the Firebase console currently recommends.
const SDK = 'https://www.gstatic.com/firebasejs/12.18.0';

let fb = null;
let initPromise = null;

export const isEnabled = () => FIREBASE.enabled && !!FIREBASE.config.projectId;

async function init() {
  if (!isEnabled()) throw new Error('Firebase is not configured');
  if (fb) return fb;
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const [appMod, authMod, fsMod, stMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
      import(`${SDK}/firebase-storage.js`),
    ]);
    const app = appMod.initializeApp(FIREBASE.config);
    // Persistent local cache: the map still shows trees with no signal.
    let db;
    try {
      db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
    } catch {
      db = fsMod.getFirestore(app);
    }
    fb = { app, auth: authMod.getAuth(app), db, storage: stMod.getStorage(app), authMod, fsMod, stMod };
    return fb;
  })();
  return initPromise;
}

// ── auth ──────────────────────────────────────────────────────────────────
/**
 * Popup first; full-page redirect where popups cannot work (installed
 * home-screen apps routinely block them). Returns null when redirecting.
 */
export async function signIn() {
  const { auth, authMod } = await init();
  const provider = new authMod.GoogleAuthProvider();
  try {
    const cred = await authMod.signInWithPopup(auth, provider);
    return cred.user;
  } catch (err) {
    const c = (err && err.code) || '';
    const popupBroken = ['auth/popup-blocked', 'auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment'].includes(c);
    if (!popupBroken) throw err;
    await authMod.signInWithRedirect(auth, provider);
    return null;
  }
}

export async function completeRedirect() {
  if (!isEnabled()) return null;
  const { auth, authMod } = await init();
  try { const r = await authMod.getRedirectResult(auth); return (r && r.user) || null; }
  catch { return null; }
}

export async function signOut() {
  const { auth, authMod } = await init();
  return authMod.signOut(auth);
}

export async function currentUser() {
  if (!isEnabled()) return null;
  const { auth, authMod } = await init();
  if (auth.currentUser) return auth.currentUser;
  return new Promise((resolve) => {
    const un = authMod.onAuthStateChanged(auth, (u) => { un(); resolve(u); });
  });
}

export async function onUserChanged(cb) {
  if (!isEnabled()) return () => {};
  const { auth, authMod } = await init();
  return authMod.onAuthStateChanged(auth, cb);
}

export async function isAdminUser() {
  const user = await currentUser();
  if (!user) return false;
  try {
    const { db, fsMod } = await init();
    return (await fsMod.getDoc(fsMod.doc(db, 'admins', user.uid))).exists();
  } catch { return false; }
}

// ── reads ─────────────────────────────────────────────────────────────────
const docsOf = (snap) => snap.docs.map(d => d.data());

/**
 * Live feed of verified trees. Works for anonymous visitors: the query
 * constrains status, which is exactly what the read rule requires.
 * Returns an unsubscribe function.
 */
export async function watchVerified(cb, onError) {
  const { db, fsMod } = await init();
  const q = fsMod.query(fsMod.collection(db, 'trees'), fsMod.where('status', '==', 'verified'));
  return fsMod.onSnapshot(q, (snap) => cb(docsOf(snap), snap.metadata.fromCache),
    (err) => onError && onError(err));
}

export async function fetchMine() {
  const user = await currentUser();
  if (!user) return [];
  const { db, fsMod } = await init();
  const q = fsMod.query(fsMod.collection(db, 'trees'), fsMod.where('userId', '==', user.uid));
  return docsOf(await fsMod.getDocs(q)).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

async function adminDb() {
  const user = await currentUser();
  if (!user) throw new Error('Sign in first');
  // A stale token is the classic cause of a permission denial moments after
  // another read succeeded; force a refresh before admin work.
  await user.getIdToken(true).catch(() => {});
  const { db, fsMod } = await init();
  return { user, db, fsMod };
}

export async function fetchByStatus(status, max = 200) {
  const { db, fsMod } = await adminDb();
  const q = fsMod.query(fsMod.collection(db, 'trees'), fsMod.where('status', '==', status), fsMod.limit(max));
  return docsOf(await fsMod.getDocs(q));
}

export async function fetchAll() {
  const { db, fsMod } = await adminDb();
  return docsOf(await fsMod.getDocs(fsMod.collection(db, 'trees')));
}

export async function counts() {
  const { db, fsMod } = await adminDb();
  const col = fsMod.collection(db, 'trees');
  const out = {};
  for (const s of ['pending_review', 'verified', 'rejected']) {
    const snap = await fsMod.getCountFromServer(fsMod.query(col, fsMod.where('status', '==', s)));
    out[s] = snap.data().count;
  }
  return out;
}

// ── writes ────────────────────────────────────────────────────────────────
/**
 * Upload photos (write-once objects named by uuid) then write the document.
 * Idempotent: a retry after a half-failed attempt reuses uploaded photos and
 * overwrites the same document id.
 */
export async function submitTree(record, photos, onProgress) {
  const user = await currentUser();
  if (!user) throw new Error('Sign in to submit a tree');
  const { db, storage, fsMod, stMod } = await init();

  const photoUrls = [];
  for (let k = 0; k < (photos || []).length; k++) {
    onProgress && onProgress(`Uploading photo ${k + 1} of ${photos.length}…`);
    const ref = stMod.ref(storage, `photos/${record.uuid}-${k}.jpg`);
    try {
      await stMod.uploadBytes(ref, photos[k], { contentType: 'image/jpeg' });
    } catch (upErr) {
      // Storage is write-once: if this object already exists from an earlier
      // attempt, that IS success - take its URL and move on.
      try { photoUrls.push(await stMod.getDownloadURL(ref)); continue; }
      catch { throw upErr; }
    }
    photoUrls.push(await stMod.getDownloadURL(ref));
  }

  onProgress && onProgress('Saving record…');
  const doc = {
    uuid: record.uuid,
    lat: record.lat, lon: record.lon,
    accuracyM: record.accuracyM ?? null,
    name: record.name,
    access: record.access,
    notes: record.notes || '',
    treeCount: record.treeCount ?? 1,
    girthCm: record.girthCm ?? null,
    heightM: record.heightM ?? null,
    condition: record.condition || null,
    contributor: record.contributor || '',
    photoUrls,
    photoUrl: photoUrls[0] || null,
    photoCount: photoUrls.length,
    userId: user.uid,          // never the email: verified docs are public
    status: 'pending_review',
    source: 'app',
    createdAt: record.createdAt,
    syncedAt: Date.now(),
    clientVersion: 1,
  };
  await fsMod.setDoc(fsMod.doc(db, 'trees', record.uuid), doc, { merge: true });
  return doc;
}

/** Admin: change status, optionally with a note and edited fields. */
export async function review(uuid, status, { note = '', fields = {} } = {}) {
  const { user, db, fsMod } = await adminDb();
  await fsMod.updateDoc(fsMod.doc(db, 'trees', uuid), {
    ...fields,
    status,
    reviewNote: note || '',
    reviewedAt: Date.now(),
    reviewedBy: user.uid,
  });
}

/**
 * Admin: attach more photos to an existing tree (e.g. re-uploading the
 * Google-Form photos that only exist as Drive links). Objects are write-once,
 * so new files continue the numbering after the ones already there.
 */
export async function addPhotos(tree, blobs, onProgress) {
  const { db, fsMod } = await adminDb();
  const { storage, stMod } = await init();
  const urls = (tree.photoUrls || []).slice();
  for (let i = 0; i < blobs.length; i++) {
    onProgress && onProgress(`Uploading photo ${i + 1} of ${blobs.length}…`);
    const ref = stMod.ref(storage, `photos/${tree.uuid}-${urls.length}.jpg`);
    await stMod.uploadBytes(ref, blobs[i], { contentType: 'image/jpeg' });
    urls.push(await stMod.getDownloadURL(ref));
  }
  await fsMod.updateDoc(fsMod.doc(db, 'trees', tree.uuid), {
    photoUrls: urls, photoUrl: urls[0] || null, photoCount: urls.length, editedAt: Date.now(),
  });
  return urls;
}

export async function updateTree(uuid, fields) {
  const { db, fsMod } = await adminDb();
  await fsMod.updateDoc(fsMod.doc(db, 'trees', uuid), { ...fields, editedAt: Date.now() });
}

export async function deleteTree(uuid) {
  const { db, fsMod } = await adminDb();
  await fsMod.deleteDoc(fsMod.doc(db, 'trees', uuid));
}

/**
 * Admin: copy legacy sheet rows into Firestore. Uses each row's stable uuid
 * as the document id and skips ids that already exist, so running it twice
 * never duplicates a tree or undoes review work done in the dashboard.
 */
export async function importLegacy(trees, onProgress) {
  const { user, db, fsMod } = await adminDb();
  let created = 0, skipped = 0, failed = 0, firstError = null;
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    onProgress && onProgress({ done: i, total: trees.length });
    try {
      const ref = fsMod.doc(db, 'trees', t.uuid);
      const existing = await fsMod.getDoc(ref);
      if (existing.exists()) { skipped++; continue; }
      await fsMod.setDoc(ref, {
        ...t,
        userId: user.uid,
        importedAt: Date.now(),
        importedBy: user.uid,
        ...(t.status !== 'pending_review' ? { reviewedAt: t.createdAt, reviewedBy: user.uid } : {}),
        clientVersion: 1,
      });
      created++;
    } catch (err) {
      failed++;
      if (!firstError) firstError = `${err.code || ''} ${err.message || err}`.trim().slice(0, 160);
    }
  }
  onProgress && onProgress({ done: trees.length, total: trees.length });
  return { created, skipped, failed, firstError };
}
