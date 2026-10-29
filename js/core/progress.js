// Progress maths: per-session summaries, XP, daily trend, streaks. Pure.
import { guessLimit } from './rules.js';

// A "read" = the right decision, on time and not a guess (the only thing that earns XP).
export function isRead(b) {
  if (b.ok !== undefined) return !!b.ok;
  if (b.mode === 4) return b.v === 'good';
  return b.fv === 'good' && (b.pv == null || b.pv === 'good');
}
export const XP_CTX = { nets: 1.5, pressure: 1.5, trial: 1.5, boss: 1.5 };
// Harder steps (pace, blackout, stage) are worth a little more. No XP for speed, volume or finishing.
export function xpForBall(b, mult) { return Math.round(10 * (1 + 0.03 * (b.lvl || 0)) * (mult || 1)); }
export function ctxMult(kind) { return XP_CTX[kind] || 1; }

// XP for a stored session. v5 balls carry their own xp; v4 balls are scored with the same rules
// (including the guess rule, using the reaction time we know).
export function sessionXP(s, rtBase) {
  const mult = ctxMult(s.kind === 'session' || !s.kind ? s.drill : s.kind), lim = guessLimit(rtBase);
  let x = 0;
  for (const b of s.balls || []) {
    if (b.xp != null) { x += b.xp; continue; }
    if (!isRead(b)) continue;
    if (b.rt != null && (b.foot || b.shot) && b.rt < lim) continue;      // too quick to be a read
    x += xpForBall(b, mult);
  }
  return x;
}

const CATS = ['Full toss', 'Yorker', 'Full', 'Good', 'Short', 'Bouncer', 'Wide off'];
// Compact summary kept even when ball-by-ball detail is dropped to save space.
export function summarize(balls) {
  const s = { n: balls.length, sc: 0, reads: 0, read: [0, 0], cats: {}, spin: [0, 0], vary: [0, 0], guess: 0, late: 0 };
  for (const c of CATS) s.cats[c] = [0, 0];
  for (const b of balls) {
    s.sc += b.sc || 0;
    if (isRead(b)) s.reads++;
    if (b.read != null && b.fv === 'good') { s.read[0] += b.read; s.read[1]++; }
    if (s.cats[b.cat]) { s.cats[b.cat][0] += b.sc || 0; s.cats[b.cat][1]++; }
    if (b.spin) { s.spin[0] += b.sc || 0; s.spin[1]++; }
    if (b.varn && !b.spin) { s.vary[0] += b.sc || 0; s.vary[1]++; }
    if (b.guess) s.guess++;
    if (b.late) s.late++;
  }
  s.sc = +s.sc.toFixed(3); s.read[0] = +s.read[0].toFixed(3);
  return s;
}

export function dayKey(d) {
  d = d instanceof Date ? d : new Date(d);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// One row per day: score, reading time, by-length scores, matches, level reached, XP.
export const isSandbox = (s) => s && s.kind === 'sandbox';
export function progressData(db) {
  const by = {};
  for (const s of db.sessions) { if (isSandbox(s)) continue; const k = dayKey(s.date); (by[k] = by[k] || []).push(s); }
  return Object.keys(by).sort().map(k => {
    const ss = by[k], acc = { n: 0, sc: 0, read: [0, 0], cats: {}, spin: [0, 0] };
    for (const c of CATS) acc.cats[c] = [0, 0];
    let xp = 0;
    for (const s of ss) {
      const m = s.sum || summarize(s.balls || []);
      acc.n += m.n; acc.sc += m.sc; acc.read[0] += m.read[0]; acc.read[1] += m.read[1];
      for (const c of CATS) if (m.cats[c]) { acc.cats[c][0] += m.cats[c][0]; acc.cats[c][1] += m.cats[c][1]; }
      acc.spin[0] += m.spin[0]; acc.spin[1] += m.spin[1]; xp += s.xp || 0;
    }
    const pc = (...cs) => { let a = 0, n = 0; for (const c of cs) { a += acc.cats[c][0]; n += acc.cats[c][1]; } return n ? Math.round(100 * a / n) : null; };
    const ms = ss.filter(s => s.match);
    return {
      k, n: acc.n, score: acc.n ? Math.round(100 * acc.sc / acc.n) : 0, read: acc.read[1] ? acc.read[0] / acc.read[1] : null,
      short: pc('Short'), full: pc('Full', 'Yorker', 'Full toss'), wide: pc('Wide off'),
      spin: acc.spin[1] ? Math.round(100 * acc.spin[0] / acc.spin[1]) : null,
      matches: ms.length, wins: ms.filter(s => s.match.won).length, lvl: Math.max(...ss.map(s => s.end == null ? 0 : s.end)), xp,
    };
  });
}

export function totalXP(db) { return db.sessions.reduce((a, s) => a + (s.xp || 0), 0); }

// Practice days: a day counts when you faced at least 20 balls.
export const DAY_MIN_BALLS = 20;
export function ballsByDay(db) {
  const m = {};
  for (const s of db.sessions) { if (isSandbox(s)) continue; const k = dayKey(s.date); m[k] = (m[k] || 0) + (s.n || (s.balls ? s.balls.length : 0)); }
  return m;
}
// Consecutive practice days ending today (or yesterday, if today isn't done yet — the streak is still alive).
export function streak(db, now = new Date()) {
  const m = ballsByDay(db), d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!((m[dayKey(d)] || 0) >= DAY_MIN_BALLS)) d.setDate(d.getDate() - 1);
  let n = 0;
  while ((m[dayKey(d)] || 0) >= DAY_MIN_BALLS) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
// This week, Monday to Sunday: which days were practice days. Goal = 5.
export const WEEK_GOAL = 5;
export function week(db, now = new Date()) {
  const m = ballsByDay(db), d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));                  // back to Monday
  const out = [];
  for (let i = 0; i < 7; i++) { const k = dayKey(d); out.push({ k, done: (m[k] || 0) >= DAY_MIN_BALLS, future: d > now }); d.setDate(d.getDate() + 1); }
  return out;
}
