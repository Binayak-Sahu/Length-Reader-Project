// Real bowlers (real.html): pure logic, tested in Node (tests/real-test.mjs).
// Clips are YouTube net videos. Bink tags each ball once (release time + the length he saw);
// training then plays the run-up and blacks the screen out at the cut point, and he calls the length.

export const KEY = 'lr-real';
export const LENS = ['F', 'G', 'S'];
export const LEN_NAME = { F: 'Full', G: 'Good', S: 'Short' };
export const LEN_FOOT = { F: 'forward', G: 'either foot', S: 'back' };

// Cut point = release + offset (seconds of video). Level 3 is at release.
export const LEVELS = [
  { n: 1, name: 'Easy', off: 0.20, note: 'Screen goes dark 0.20 s after release' },
  { n: 2, name: 'Medium', off: 0.10, note: 'Dark 0.10 s after release' },
  { n: 3, name: 'Hard', off: 0.0, note: 'Dark right at release' },
];
export const LEAD = 3.5;        // seconds of run-up shown before release
export const REVEAL = 2.2;      // seconds of the rest of the ball shown after the call
export const TAP_LAG = 0.12;    // human tap delay (s of real time) taken off a release tap
export const SESSION = 20;      // balls per session
export const MIN_GAP = 1.0;     // two releases closer than this (s) are the same ball

/** YouTube video id from a link or a bare id; null if it isn't one. */
export function parseYouTubeId(s) {
  s = String(s || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  let u;
  try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else { const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/); if (m) id = m[1]; }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** Start time (s) from a link's t= / start= (e.g. 1m20s, 80); 0 if none. */
export function parseStart(s) {
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
    const t = u.searchParams.get('t') || u.searchParams.get('start');
    if (!t) return 0;
    if (/^\d+$/.test(t)) return +t;
    const m = t.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
  } catch { return 0; }
}

// Videos Bink chose; added once to every library (removing one keeps it removed).
export const STARTERS = [{ id: 'enRiR-kqxE4', title: 'Net session (starter video)' }];
export const VIEWS = ['wide', 'portrait'];
export const SHIFT_STEP = 0.1;
export const clampShift = (x) => Math.max(-1, Math.min(1, Math.round((+x || 0) * 100) / 100));

export const emptyDb = () => seedStarters({ v: 1, videos: [], level: 1, sessions: [], view: 'portrait', seeded: [] });
/** Adds starter videos not added before (tracked in d.seeded). */
export function seedStarters(d) {
  for (const s of STARTERS) if (!d.seeded.includes(s.id)) {
    d.seeded.push(s.id);
    if (!d.videos.some(v => v.id === s.id)) d.videos.push({ id: s.id, title: s.title, balls: [] });
  }
  return d;
}

/** Load and repair saved data. Bad or missing data → an empty library. */
export function load(storage) {
  let d = null;
  try { d = JSON.parse(storage.getItem(KEY)); } catch { d = null; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.videos)) return emptyDb();
  const videos = [];
  for (const v of d.videos) {
    if (!v || !parseYouTubeId(v.id) || videos.some(x => x.id === v.id)) continue;
    const balls = (Array.isArray(v.balls) ? v.balls : []).filter(b => b && isFinite(b.t) && b.t >= 0 && LENS.includes(b.len))
      .map(b => ({ t: Math.round(b.t * 1000) / 1000, len: b.len })).sort((a, b) => a.t - b.t);
    videos.push({ id: v.id, title: String(v.title || v.id).slice(0, 120), balls, ...(v.start > 0 ? { start: +v.start } : {}), ...(v.shift ? { shift: clampShift(v.shift) } : {}), ...(v.blocked ? { blocked: true } : {}) });
  }
  const level = LEVELS.some(l => l.n === d.level) ? d.level : 1;
  const sessions = (Array.isArray(d.sessions) ? d.sessions : []).filter(s => s && isFinite(s.n) && isFinite(s.right)).slice(-200);
  const view = VIEWS.includes(d.view) ? d.view : 'portrait';
  const seeded = Array.isArray(d.seeded) ? d.seeded.filter(x => typeof x === 'string') : [];
  return seedStarters({ v: 1, videos, level, sessions, view, seeded });
}
export function save(storage, d) { try { storage.setItem(KEY, JSON.stringify(d)); return true; } catch { return false; } }

/** Add a ball to a video's tag list, keeping it sorted. A tap within MIN_GAP of an existing ball replaces it. */
export function addBall(video, t, len) {
  if (!LENS.includes(len) || !isFinite(t) || t < 0) return false;
  t = Math.round(t * 1000) / 1000;
  video.balls = video.balls.filter(b => Math.abs(b.t - t) >= MIN_GAP);
  video.balls.push({ t, len });
  video.balls.sort((a, b) => a.t - b.t);
  return true;
}

/** Release time from a tap made while watching at `rate` (0.25–1): take off the tap delay in video time. */
export const tapToRelease = (tapT, rate) => Math.max(0, tapT - TAP_LAG * rate);

export const cutTime = (release, level) => release + (LEVELS.find(l => l.n === level) || LEVELS[0]).off;

/** Shuffled deck of balls from the playable videos, at most n. rnd: () => [0,1). */
export function makeDeck(videos, n = SESSION, rnd = Math.random) {
  const all = [];
  for (const v of videos) if (!v.blocked) for (const b of v.balls) all.push({ id: v.id, title: v.title, t: b.t, len: b.len });
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all.slice(0, Math.min(n, all.length));
}

/** Counts of tagged balls by length across videos. */
export function tagCounts(videos) {
  const c = { F: 0, G: 0, S: 0, total: 0 };
  for (const v of videos) if (!v.blocked) for (const b of v.balls) { c[b.len]++; c.total++; }
  return c;
}

/** Session summary from answers [{len, call, ms}]. */
export function summary(answers) {
  const by = { F: [0, 0], G: [0, 0], S: [0, 0] };
  let right = 0, wentForwardToShort = 0;
  const times = [];
  for (const a of answers) {
    by[a.len][1]++;
    if (a.call === a.len) { right++; by[a.len][0]++; }
    if (a.len === 'S' && a.call === 'F') wentForwardToShort++;
    if (isFinite(a.ms)) times.push(a.ms);
  }
  times.sort((x, y) => x - y);
  const med = times.length ? times[Math.floor((times.length - 1) / 2)] : null;
  return { n: answers.length, right, pct: answers.length ? Math.round(100 * right / answers.length) : 0, by, wentForwardToShort, medianMs: med };
}

/** Suggest a level change after a session: ≥85% → up, <60% → down. Needs at least 10 balls. */
export function nextLevel(level, s) {
  if (s.n < 10) return level;
  if (s.pct >= 85 && level < 3) return level + 1;
  if (s.pct < 60 && level > 1) return level - 1;
  return level;
}

export const fmtTime = (t) => { t = Math.max(0, t); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };
