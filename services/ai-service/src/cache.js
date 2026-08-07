/** Tiny in-memory TTL cache — question sets for the same role cost tokens once per day. */
const store = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > TTL_MS) { store.delete(key); return null; }
  return hit.v;
}

export function cacheSet(key, value) {
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
  store.set(key, { v: value, t: Date.now() });
}
