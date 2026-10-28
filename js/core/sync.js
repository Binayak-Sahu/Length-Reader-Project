// Sync between devices: the shared part of the save and a merge that never loses data. Pure (tested in Node).
// Shared: sessions, level, career, badges, boss bests. Per device: settings (calibration, pedals), reaction time, feeding stats.
import { mergeSessions, compact } from './store.js';

export const SYNC_FILE = 'length-reader-sync.json', SYNC_MAX = 900_000;

export function syncPayload(db, maxChars = SYNC_MAX) {
  const d = {
    sessions: db.sessions, level: db.level, levelD: db.levelD, levelAt: db.levelAt || null,
    career: db.career, badges: db.badges, bosses: db.bosses,
  };
  // the gist API is happiest under ~1 MB: drop ball detail from the oldest sessions of a copy (summaries stay)
  const copy = JSON.parse(JSON.stringify(d));
  const text = compact(copy, maxChars).text;
  return { app: 'length-reader-sync', version: 1, saved: new Date().toISOString(), data: JSON.parse(text) };
}

// Merge a remote payload into db (in place). Symmetric: both devices end up with the same shared data.
export function mergeSynced(db, remote) {
  const r = remote && remote.app === 'length-reader-sync' && remote.data;
  if (!r) throw new Error('Not a Length Reader sync file');
  const out = { sessions: 0, badges: 0, level: false };
  out.sessions = mergeSessions(db, (r.sessions || []).filter(s => s && s.date));
  for (const k in r.badges || {}) {
    if (!db.badges[k]) { db.badges[k] = r.badges[k]; out.badges++; }
    else if (r.badges[k] < db.badges[k]) db.badges[k] = r.badges[k];          // keep the first time it was earned
  }
  for (const k in r.bosses || {}) db.bosses[k] = Math.max(db.bosses[k] || 0, r.bosses[k]);
  const rc = r.career || {};
  if ((rc.tier | 0) > db.career.tier) db.career.tier = rc.tier | 0;
  const have = new Set(db.career.trials.map(t => t.date));
  for (const t of rc.trials || []) if (t && t.date && !have.has(t.date)) { db.career.trials.push(t); have.add(t.date); }
  db.career.trials.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  // level: whichever device changed it last (saves from before sync have no date: the higher level wins once)
  const newer = r.levelAt ? (!db.levelAt || r.levelAt > db.levelAt) : (!db.levelAt && (r.level | 0) > db.level);
  if (newer && r.level != null) {
    out.level = db.level !== r.level;
    db.level = Math.max(0, Math.min(27, r.level | 0)); db.levelD = r.levelD >= 0 && r.levelD <= 1 ? r.levelD : 0.5; db.levelAt = r.levelAt || null;
  }
  return out;
}
