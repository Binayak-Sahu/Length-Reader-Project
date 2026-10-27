// Saved data: shape, v4 migration, import/export, compaction. Pure apart from the storage object passed in
// (window.localStorage in the app, a Map-backed fake in tests).
import { summarize, sessionXP } from './progress.js';

export const KEY = 'lr5', V4_KEY = 'lr_v3', MAX_CHARS = 3_500_000;

export const DEF = {
  maxKph: 120, view: 'auto', trigger: false, rotate: 'ball', club: true, netsGap: 20, spinners: true, hawk: true, smart: true,
  lifeCm: 60, lifeM: 1.5, boost: 1.8, gap: 2.5, widePct: 22, bouncerPct: 8, levelMode: 'auto', sound: true, voice: true, fullscreen: true,
  // v5
  feedback: 'auto', quality: 'auto', overlay: false, haptics: true, textScale: 1, contrast: false, reduceMotion: false, ball: 'red',
  // v5.2: life-size calibration, pitch and input options
  sight: 'dark', calib: null, lenMarks: 'auto', night: false, pedals: null, stepCue: false, fpsOnly: false,
};

export function newDB() {
  return {
    v: 5, created: new Date().toISOString(),
    profile: { hand: 'R', onboarded: false, seenV5: false },
    settings: Object.assign({}, DEF),
    level: 0, levelD: 0.5, rtBase: null, cs: { pace: {}, spin: {} },
    sessions: [], career: { tier: 0, trials: [] }, badges: {}, bosses: {},
    v3: { merged: false, last: null, count: 0 }, imports: [],
  };
}

// Fill any gaps (older v5 saves, imports) so the rest of the app can rely on every field.
export function normalize(db) {
  const d = newDB();
  db = Object.assign(d, db || {});
  db.profile = Object.assign(newDB().profile, db.profile || {});
  db.settings = cleanSettings(db.settings);
  db.career = Object.assign({ tier: 0, trials: [] }, db.career || {});
  db.cs = db.cs || { pace: {}, spin: {} };
  db.sessions = (db.sessions || []).filter(s => s && s.date);
  if (!(db.levelD >= 0 && db.levelD <= 1)) db.levelD = 0.5;
  db.level = Math.max(0, Math.min(27, db.level | 0));
  return db;
}
function cleanSettings(s) {
  const out = Object.assign({}, DEF);
  for (const k in DEF) if (s && s[k] !== undefined && typeof s[k] === typeof DEF[k]) out[k] = s[k];
  return out;
}

// v4 session → v5 session (adds xp + summary; leaves the ball records as they were).
function fromV4Session(s, rtBase) {
  const out = Object.assign({}, s, { src: 'v4', kind: s.match ? 'match' : (s.drill || 'session') });
  out.balls = (s.balls || []).map(b => Object.assign({}, b));
  out.xp = sessionXP(out, rtBase);
  out.sum = summarize(out.balls);
  return out;
}

export function mergeSessions(db, list) {
  const have = new Set(db.sessions.map(s => s.date));
  let added = 0;
  for (const s of list) if (s && s.date && !have.has(s.date)) { db.sessions.push(s); have.add(s.date); added++; }
  if (added) db.sessions.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  return added;
}

// v4 → v5. First time: settings, level, reaction time, smart-feeding stats and all sessions.
// Every later start: only sessions newer than the last merge (in case v4 was used as a fallback).
export function mergeV4(db, v3) {
  if (!v3 || typeof v3 !== 'object') return 0;
  const first = !db.v3.merged;
  if (first) {
    db.settings = cleanSettings(Object.assign({}, db.settings, v3.settings || {}));
    if (v3.level != null) { db.level = Math.max(0, Math.min(27, v3.level | 0)); db.levelD = 0.5; }
    if (v3.rtBase) db.rtBase = v3.rtBase;
    if (v3.cs) db.cs = v3.cs;
  }
  const rt = db.rtBase || v3.rtBase || null;
  const fresh = (v3.sessions || []).filter(s => s && s.date && (!db.v3.last || s.date > db.v3.last));
  const added = mergeSessions(db, fresh.map(s => fromV4Session(s, rt)));
  if (!first && fresh.length && v3.level != null) db.level = Math.max(0, Math.min(27, v3.level | 0));   // v4 was played: follow its level
  const dates = (v3.sessions || []).map(s => s.date).filter(Boolean).sort();
  db.v3.merged = true; db.v3.count += added; if (dates.length) db.v3.last = dates[dates.length - 1];
  return added;
}

// Import a file: v4 export ({app, version:1, level, sessions}), v5 export ({app, version:5, data}) or a raw v4 save.
export function importData(db, obj, name) {
  if (!obj || typeof obj !== 'object') throw new Error('Not a Length Reader file');
  let sessions = [], level = null, rtBase = null, extra = null;
  if (obj.app === 'length-reader' && obj.version >= 5 && obj.data) {
    const d = normalize(obj.data); sessions = d.sessions; level = d.level; rtBase = d.rtBase; extra = d;
  } else if ((obj.app === 'length-reader' && Array.isArray(obj.sessions)) || (Array.isArray(obj.sessions) && obj.settings)) {
    rtBase = obj.rtBase || null; level = obj.level;
    sessions = obj.sessions.map(s => fromV4Session(s, db.rtBase || rtBase));
  } else throw new Error('Not a Length Reader file');
  const added = mergeSessions(db, sessions);
  if (level != null && level > db.level) { db.level = Math.min(27, level | 0); db.levelD = 0.5; }
  if (!db.rtBase && rtBase) db.rtBase = rtBase;
  if (extra) {
    for (const k in extra.badges) if (!db.badges[k]) db.badges[k] = extra.badges[k];
    for (const k in extra.bosses) db.bosses[k] = Math.max(db.bosses[k] || 0, extra.bosses[k]);
    if (extra.career.tier > db.career.tier) db.career.tier = extra.career.tier;
    db.career.trials = db.career.trials.concat(extra.career.trials.filter(t => !db.career.trials.some(u => u.date === t.date)));
  }
  db.imports.push({ name: name || 'file', date: new Date().toISOString(), added });
  return added;
}

export function exportData(db) {
  return { app: 'length-reader', version: 5, exported: new Date().toISOString(), data: db };
}

// Keep the save under the browser's ~5 MB limit: drop ball-by-ball detail from the oldest sessions
// (their summaries, XP and scores stay, so progress charts keep working).
export function compact(db, maxChars = MAX_CHARS) {
  let s = JSON.stringify(db), dropped = 0;
  if (s.length <= maxChars) return { text: s, dropped };
  for (let i = 0; i < db.sessions.length - 5; i++) {         // the newest 5 sessions always keep their detail
    const se = db.sessions[i];
    if (!se.balls || !se.balls.length) continue;
    if (!se.sum) se.sum = summarize(se.balls);
    se.balls = []; se.compact = true; dropped++;
    if (dropped % 10 === 0) { s = JSON.stringify(db); if (s.length <= maxChars) return { text: s, dropped }; }
  }
  return { text: JSON.stringify(db), dropped };
}

export function load(storage) {
  let db = null, fresh = false;
  try { db = JSON.parse(storage.getItem(KEY)); } catch (e) { db = null; }
  if (!db) { db = newDB(); fresh = true; }
  db = normalize(db);
  let v3 = null; try { v3 = JSON.parse(storage.getItem(V4_KEY)); } catch (e) { v3 = null; }
  const firstV4 = !!v3 && !db.v3.merged;
  const added = v3 ? mergeV4(db, v3) : 0;
  if (fresh && firstV4) db.profile.onboarded = true;      // a v4 player: skip the beginner tutorial
  return { db, fresh, added, fromV4: firstV4 };
}

// Browsers differ in how much they allow, so step the size down until the save fits.
export function save(storage, db) {
  for (const lim of [MAX_CHARS, 2e6, 1e6, 5e5, 2.5e5, 0]) {
    try { storage.setItem(KEY, compact(db, lim).text); return true; } catch (e) { /* too big: compact harder */ }
  }
  return false;
}
