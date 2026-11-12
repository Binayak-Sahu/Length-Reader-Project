// Skill check: the same short test every time, so the result can be compared from week to week. Pure (tested in Node).
//
// Why it exists: in training the level moves to keep you right about 85% of the time, so a training score can't show
// improvement (and how you do during practice is a poor guide to what you have learned: Soderstrom & Bjork 2015).
// A fixed test with no feedback, taken fresh, can. It never moves the level and earns no XP, so there is nothing to farm.
//
// The test: 24 balls, feet only, all on the stumps, no feedback until the end.
//   pace (110 kph): 8 full, 8 short, 2 good-length      spin: 3 full, 3 short
//   half of each group is blacked out 160 ms after release (the early pick-up), half is seen all the way.
import { isRead } from './progress.js';

export const CHECK_KPH = 110, CHECK_OCC = 0.16, CHECK_N = 24, CHECK_VERSION = 1;

// The 24 balls in a shuffled order. No more than 3 of the same length in a row, so a run can't be "read" by counting.
export function checkBalls(rng = Math.random) {
  const cells = [];
  const add = (spin, cat, n) => { for (let i = 0; i < n; i++) cells.push({ spin, cat, occ: i % 2 ? CHECK_OCC : null }); };
  add(null, 'Full', 8); add(null, 'Short', 8); add(null, 'Good', 2);
  add('off', 'Full', 2); add('off', 'Short', 1); add('leg', 'Full', 1); add('leg', 'Short', 2);
  const runOk = (xs) => { let run = 1; for (let i = 1; i < xs.length; i++) { run = xs[i].cat === xs[i - 1].cat ? run + 1 : 1; if (run > 3) return false; } return true; };
  let out = cells;
  for (let tries = 0; tries < 200; tries++) {
    out = cells.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
    if (runOk(out)) break;
  }
  return out;
}

// Inverse of the standard normal distribution (Acklam's approximation; error < 5e-4, plenty for a 24-ball test).
export function zOf(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const lo = 0.02425;
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const pct = (a, n) => n ? Math.round(100 * a / n) : null;
const isShort = (b) => b.fe === 'B', isFull = (b) => b.fe === 'F';

// What the 24 ball records say. All numbers come from the same grading as every other mode.
//   score     % of balls read right and on time (the headline; guesses and late answers don't count)
//   tell      0–100: how well the feet tell short from full, whatever the timing (from d′, the standard sensitivity measure)
//   lean      'front' | 'back' | null: a habit of going one way when unsure (from the response bias c)
export function checkReport(balls) {
  const n = balls.length, clear = balls.filter(b => isShort(b) || isFull(b));
  const short = clear.filter(isShort), full = clear.filter(isFull);
  const reads = balls.filter(isRead).length;
  const wentBack = (xs) => xs.filter(b => b.foot === 'B').length;
  // Signal detection on the foot choice: "short" is the signal, a back-foot move is "yes".
  // Log-linear correction (+0.5 / +1) keeps perfect scores finite. No move at all counts as not going back.
  let dprime = null, bias = null;
  if (short.length >= 3 && full.length >= 3) {
    const H = (wentBack(short) + 0.5) / (short.length + 1), F = (wentBack(full) + 0.5) / (full.length + 1);
    dprime = zOf(H) - zOf(F); bias = -(zOf(H) + zOf(F)) / 2;
  }
  const tell = dprime == null ? null : Math.max(0, Math.min(100, Math.round(100 * dprime / 3)));   // d′ of 3 ≈ 93% right both ways: call that 100
  const lean = bias == null ? null : bias > 0.35 ? 'front' : bias < -0.35 ? 'back' : null;
  const seen = balls.filter(b => b.occ == null), dark = balls.filter(b => b.occ != null);
  const good = (xs) => xs.filter(isRead).length;
  const rts = balls.filter(b => b.foot && b.rt != null && b.tbP != null).map(b => b.tbP - b.rt).sort((a, b) => a - b);
  return {
    v: CHECK_VERSION, n, complete: n >= CHECK_N, score: pct(reads, n), reads,
    short: pct(good(short), short.length), shortN: short.length, full: pct(good(full), full.length), fullN: full.length,
    fwdShort: short.filter(b => b.foot === 'F').length, backFull: full.filter(b => b.foot === 'B').length,
    froze: balls.filter(b => !b.foot).length, guess: balls.filter(b => b.guess).length, late: balls.filter(b => b.late).length,
    seen: pct(good(seen), seen.length), dark: pct(good(dark), dark.length),
    pace: pct(good(balls.filter(b => !b.spin)), balls.filter(b => !b.spin).length), spin: pct(good(balls.filter(b => b.spin)), balls.filter(b => b.spin).length),
    dprime: dprime == null ? null : +dprime.toFixed(2), bias: bias == null ? null : +bias.toFixed(2), tell, lean,
    early: rts.length ? +rts[rts.length >> 1].toFixed(3) : null,      // median: how long before the bounce the feet were decided (s)
    kph: balls.filter(b => !b.spin).map(b => b.kph).sort((a, b) => a - b)[balls.filter(b => !b.spin).length >> 1] || null,
  };
}

// One plain sentence: the single thing to work on (or a well done). Never more than one.
export function checkAdvice(r) {
  if (r.score == null) return '';
  if (r.froze >= 3) return `Your feet didn't move on ${r.froze} balls. Commit to a foot every ball, even when unsure.`;
  if (r.guess >= 3) return `${r.guess} moves were too quick to be a read. Watch it out of the hand, then move.`;
  if (r.lean === 'front' || r.fwdShort >= 3) return `You went forward to ${r.fwdShort} short ball${r.fwdShort === 1 ? '' : 's'}. Short-ball drill next, and wait for the length.`;
  if (r.lean === 'back' || r.backFull >= 3) return `You went back to ${r.backFull} pitched-up ball${r.backFull === 1 ? '' : 's'}. Get forward to anything full.`;
  if (r.late >= 3) return `${r.late} answers came after the bounce. Decide earlier: hand, first part of the flight, move.`;
  if (r.dark != null && r.seen != null && r.seen - r.dark >= 25) return 'Full view is fine; the blacked-out balls let you down. That is the early pick-up: keep training with the blackout.';
  if (r.spin != null && r.pace != null && r.pace - r.spin >= 25) return 'Pace is fine; spin let you down. Spin drill next.';
  if (r.score >= 85) return 'Strong. Take that into the nets.';
  return 'No single leak. Keep the daily session going and test again next week.';
}

// The checks in a save, oldest first, complete tests only (a test stopped early isn't comparable).
export function checkHistory(sessions) {
  return (sessions || []).filter(s => s && s.kind === 'check' && s.check && s.check.complete).map(s => ({ date: s.date, ...s.check }));
}

// How the latest check compares. With 24 balls, a few points either way is noise: say so instead of cheering.
// ~10 points is about one standard error of the difference between two 24-ball tests at 70–85%.
export const CHECK_NOISE = 10;
export function checkTrend(hist) {
  if (!hist.length) return { state: 'none' };
  const last = hist[hist.length - 1];
  if (hist.length === 1) return { state: 'first', last };
  const first = hist[0], prev = hist[hist.length - 2], best = Math.max(...hist.map(h => h.score));
  const d = last.score - first.score;
  return { state: d >= CHECK_NOISE ? 'up' : d <= -CHECK_NOISE ? 'down' : 'flat', last, first, prev, best, delta: d, n: hist.length };
}

// When to suggest the next one: a week after the last (or now, if never taken and there's some practice behind you).
export function checkDue(sessions, now = Date.now()) {
  const h = checkHistory(sessions);
  if (!h.length) return { due: sessions.filter(s => s.kind !== 'sandbox' && s.kind !== 'tutorial').length >= 1, days: null, never: true };
  const days = Math.floor((now - Date.parse(h[h.length - 1].date)) / 864e5);
  return { due: days >= 7, days, never: false };
}
