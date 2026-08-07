/**
 * Interview videos live in the browser (IndexedDB), keyed by interview id.
 * This keeps the server stateless and cheap; production teams that need
 * shared access can upload blobs to S3/GCS instead — same interface.
 */
const DB_NAME = "hirelens_videos";
const STORE = "videos";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
  });
}

export const videoStore = {
  save: (id, blob) => tx("readwrite", s => s.put(blob, id)),
  get: id => tx("readonly", s => s.get(id)),
  remove: id => tx("readwrite", s => s.delete(id)),
  removeMany: ids => tx("readwrite", s => { ids.forEach(id => s.delete(id)); })
};
