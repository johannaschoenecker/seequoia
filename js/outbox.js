// IndexedDB outbox: a submission is saved here first, then pushed to Firebase.
// If the push fails (no signal, popup blocked, Storage hiccup) nothing is
// lost - the record and its photos wait on the device until "Retry".

const DB_NAME = 'sequoia';
const DB_VERSION = 1;
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'uuid' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    let out;
    try { out = fn(t.objectStore(store)); } catch (err) { reject(err); return; }
    let value;
    if (out instanceof IDBRequest) out.onsuccess = () => { value = out.result; };
    else value = out;
    t.oncomplete = () => resolve(value);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/** item = { uuid, record, photos: Blob[], createdAt, lastError } */
export const put    = (item) => tx('outbox', 'readwrite', s => s.put(item));
export const get    = (uuid) => tx('outbox', 'readonly',  s => s.get(uuid));
export const all    = ()     => tx('outbox', 'readonly',  s => s.getAll()).then(v => v || []);
export const remove = (uuid) => tx('outbox', 'readwrite', s => s.delete(uuid));
export const count  = ()     => tx('outbox', 'readonly',  s => s.count());

export const setMeta = (k, v) => tx('meta', 'readwrite', s => s.put({ k, v }));
export const getMeta = (k)    => tx('meta', 'readonly',  s => s.get(k)).then(r => r && r.v);
