// Backups of the save: one snapshot per day, kept on the device (IndexedDB, see js/backup-idb.js). Pure (tested in Node).
// Rules: a restore never deletes anything (it only adds what is missing), a smaller save never replaces a bigger
// snapshot of the same day, and a save that can't be read is kept aside instead of being overwritten.
import { normalize, mergeSessions, importData } from './store.js';
import { mergeActions } from './myactions.js';
import { dayKey } from './progress.js';

export const KEEP_DAYS = 7, DAMAGED_KEY = 'lr5-damaged';

// What is in the save slot? 'empty' (nothing there) · 'ok' · 'damaged' (text that isn't a save).
export function inspectRaw(raw) {
  if (raw == null || raw === '') return 'empty';
  try { const o = JSON.parse(raw); return o && typeof o === 'object' && !Array.isArray(o) ? 'ok' : 'damaged'; }
  catch (e) { return 'damaged'; }
}

export function snapKey(now = new Date()) { return 'day-' + dayKey(now); }

// A snapshot record for today, or null when there is nothing worth keeping (no sessions and no bowlers).
export function makeSnapshot(db, now = new Date()) {
  const n = (db.sessions || []).length, acts = (db.actions || []).length;
  if (!n && !acts) return null;
  return { k: snapKey(now), at: now.toISOString(), n, balls: db.sessions.reduce((a, s) => a + (s.n || 0), 0), text: JSON.stringify(db) };
}
// Should `next` replace the snapshot already stored under the same key? Not if it holds fewer sessions:
// if something went wrong today, the fuller copy from earlier in the day is the one to keep.
export function shouldReplace(existing, next) { return !existing || (next.n | 0) >= (existing.n | 0); }

// Which daily keys to delete so that only the newest `keep` remain.
export function pruneList(keys, keep = KEEP_DAYS) {
  const days = keys.filter(k => k.startsWith('day-')).sort();
  return days.slice(0, Math.max(0, days.length - keep));
}

// Put a snapshot back. full = the live save was unreadable or empty: take everything from the snapshot (settings,
// calibration, reaction time…), then add any sessions played since. Otherwise only add what is missing.
// Returns { added, full }. Throws if the text isn't a save.
export function restoreSnapshot(db, text, full) {
  if (inspectRaw(text) !== 'ok') throw new Error('That backup can’t be read');
  const snap = normalize(JSON.parse(text));
  if (full) {
    const mine = db.sessions || [], myActs = db.actions || [];
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, snap);
    const added = mergeSessions(db, mine);
    mergeActions(db, myActs);
    return { added: snap.sessions.length + added, full: true };
  }
  const added = importData(db, { app: 'length-reader', version: 5, data: snap }, 'backup ' + (snap.created || ''));
  mergeActions(db, snap.actions);
  return { added, full: false };
}

// Another tab of the app saved: take the sessions and bowlers it has that we don't (never drop ours).
export function mergeOtherTab(db, raw) {
  if (inspectRaw(raw) !== 'ok') return { sessions: 0, actions: 0 };
  let other; try { other = normalize(JSON.parse(raw)); } catch (e) { return { sessions: 0, actions: 0 }; }
  return { sessions: mergeSessions(db, other.sessions), actions: mergeActions(db, other.actions) };
}
