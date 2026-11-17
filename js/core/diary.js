// Real nets diary: three taps after a real net, so carry-over from the app to real nets can be followed. Pure (tested in Node).
//
// An entry: { id, date (ISO, the day of the net), read, short, leave (each 0 | 1 | 2), at (ISO, last change), del? }
//   read   0 picked length late · 1 mostly on time · 2 early and right
//   short  0 went forward to short balls · 1 mixed · 2 went back
//   leave  0 chased wide ones · 1 some · 2 left well
// Deleting keeps a tombstone (del: true) so another device can't bring the entry back through sync.
// These are the batter's own feelings, not measurements: the Progress screen says so and never claims they prove anything.

export const DIARY_Q = [
  { k: 'read', q: 'Reading length', o: ['Late', 'Mostly on time', 'Early and right'] },
  { k: 'short', q: 'Short balls', o: ['Went forward', 'Mixed', 'Went back'] },
  { k: 'leave', q: 'Leaving outside off', o: ['Chased', 'Some', 'Left well'] },
];
export const DIARY_MAX = 400;
const ok3 = (v) => v === 0 || v === 1 || v === 2;

export function validEntry(e) {
  return !!(e && typeof e.id === 'string' && e.id && typeof e.date === 'string' && !isNaN(Date.parse(e.date)) &&
    (e.del === true || (ok3(e.read) && ok3(e.short) && ok3(e.leave))));
}

export function makeEntry(ans, date = new Date(), rng = Math.random) {
  const d = new Date(date), at = new Date().toISOString();
  return { id: d.toISOString().slice(0, 10) + '-' + Math.floor(rng() * 36 ** 6).toString(36).padStart(6, '0'),
    date: d.toISOString(), read: ans.read, short: ans.short, leave: ans.leave, at };
}

// Add or replace (newer `at` wins). Returns true if db.diary changed.
function put(list, e) {
  const i = list.findIndex(x => x.id === e.id);
  if (i < 0) { list.push(e); return true; }
  if ((e.at || '') > (list[i].at || '')) { list[i] = e; return true; }
  return false;
}
function tidy(list) {
  list.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1);
  if (list.length > DIARY_MAX) list.splice(0, list.length - DIARY_MAX);
  return list;
}

export function addEntry(db, e) { db.diary = db.diary || []; put(db.diary, e); tidy(db.diary); return e; }
export function deleteEntry(db, id) {
  const e = (db.diary || []).find(x => x.id === id); if (!e || e.del) return false;
  put(db.diary, { id, date: e.date, del: true, at: new Date(Math.max(Date.now(), Date.parse(e.at || 0) + 1)).toISOString() }); return true;
}
// Merge another copy (sync, import, backup, another tab). Never drops an entry; returns how many were added or changed.
export function mergeDiary(db, list) {
  db.diary = db.diary || []; const changed = new Set();
  for (const e of list || []) if (validEntry(e) && put(db.diary, Object.assign({}, e))) changed.add(e.id);
  tidy(db.diary);
  return db.diary.filter(e => changed.has(e.id)).length;            // only what is still kept after the cap counts
}
export const liveEntries = (diary) => (diary || []).filter(e => !e.del);

const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
// 0–100 for one entry (all three answers count the same)
export const netScore = (e) => Math.round(100 * (e.read + e.short + e.leave) / 6);

// What the diary says, next to the Skill check. checks = checkHistory(sessions) (oldest first).
//   state: 'none' | 'few' (under 3 nets) | 'up' | 'down' | 'same'
// Each net is paired with the latest Skill check taken in the 14 days up to that day (a check later the same day counts), if any.
export function diaryCarry(diary, checks = []) {
  const L = liveEntries(diary);
  const rows = L.map(e => {
    const t = Date.parse(e.date), ck = checks.filter(c => { const d = t - Date.parse(c.date); return d >= -864e5 / 2 && d <= 14 * 864e5; }).pop() || null;
    return { e, score: netScore(e), check: ck ? ck.score : null };
  });
  if (!L.length) return { state: 'none', rows };
  if (L.length < 3) return { state: 'few', rows };
  const half = Math.floor(L.length / 2), first = avg(rows.slice(0, half).map(r => r.score)), last = avg(rows.slice(-half).map(r => r.score));
  const delta = Math.round(last - first);
  const by = (k) => { const a = avg(L.slice(0, half).map(e => e[k])), b = avg(L.slice(-half).map(e => e[k])); return Math.round(50 * (b - a)); };
  // one step on one question of three moves an entry by about 17 points: up to that is "about the same"
  return { state: delta >= 20 ? 'up' : delta <= -20 ? 'down' : 'same', delta, first: Math.round(first), last: Math.round(last), rows,
    parts: { read: by('read'), short: by('short'), leave: by('leave') } };
}
