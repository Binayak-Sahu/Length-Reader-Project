// Daily backups of the save in IndexedDB (roomier than localStorage and separate from it). Rules are in core/backup.js.
// Every call is safe to ignore: if IndexedDB is missing or blocked (some private windows) backups are simply off.
import { makeSnapshot, shouldReplace, pruneList, KEEP_DAYS } from './core/backup.js';

const DB = 'lr-backup', STORE = 'snaps';

export function createBackups(idb = (typeof indexedDB !== 'undefined' ? indexedDB : null)) {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    if (!idb) return rej(new Error('no IndexedDB'));
    const r = idb.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'k' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
      t.oncomplete = () => res(out && 'result' in out ? out.result : undefined); t.onerror = t.onabort = () => rej(t.error);
    });
  };
  const all = () => tx('readonly', s => s.getAll()).then(x => x || []);
  const api = {
    // Today's snapshot. Never replaces a fuller one from earlier today; keeps the newest KEEP_DAYS days.
    async snapshot(db, now = new Date()) {
      const snap = makeSnapshot(db, now); if (!snap) return false;
      const have = await tx('readonly', s => s.get(snap.k));
      if (!shouldReplace(have, snap)) return false;
      await tx('readwrite', s => s.put(snap));
      const drop = pruneList((await all()).map(x => x.k), KEEP_DAYS);
      if (drop.length) await tx('readwrite', s => { drop.forEach(k => s.delete(k)); });
      return true;
    },
    // A save that couldn't be read: kept as it is (up to 3), in case it can be rescued by hand.
    async keepDamaged(raw, now = new Date()) {
      await tx('readwrite', s => s.put({ k: 'damaged-' + now.toISOString(), at: now.toISOString(), n: 0, balls: 0, text: String(raw) }));
      const old = (await all()).map(x => x.k).filter(k => k.startsWith('damaged-')).sort().slice(0, -3);
      if (old.length) await tx('readwrite', s => { old.forEach(k => s.delete(k)); });
    },
    // Newest first, without the (large) text.
    async list() { return (await all()).filter(x => x.k.startsWith('day-')).sort((a, b) => a.k < b.k ? 1 : -1).map(({ k, at, n, balls }) => ({ k, at, n, balls })); },
    async get(k) { return tx('readonly', s => s.get(k)); },
    async clear() { return tx('readwrite', s => s.clear()); },
  };
  // never let a backup problem reach the game
  for (const k of Object.keys(api)) { const f = api[k]; api[k] = (...a) => f(...a).catch(() => (k === 'list' ? [] : null)); }
  return api;
}
