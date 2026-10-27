// What gets bowled: bowler profiles, ball generation and the release "hand cue". Pure; the RNG is injectable.
import { zones } from './physics.js';

// Bowlers: size, crease position (xo), how side-on (tw), arm angle at release (ao, degrees past vertical).
// Release heights (measured in tests/core-test.mjs): pace 2.1–2.3 m scaled by the bowler's size; spin 1.9–2.0 m
// (a lower, rounder arm). Spinners have a short, slow run-up.
export const BOWLERS = [
  { id: 'tall', n: 'Tall quick', s: 1.07, xo: 0, c: 0x1d2530, tw: 1, ao: 0 },
  { id: 'skiddy', n: 'Skiddy', s: 1.01, xo: 0, c: 0x7a1d1d, tw: 0.8, ao: -4 },
  { id: 'wide', n: 'Wide of crease', s: 1.02, xo: -0.35, c: 0x1d3d7a, tw: 0.6, ao: -4 },
  { id: 'off', n: 'Off-spinner', s: 1.0, xo: 0.1, c: 0x14532d, tw: 0.5, ao: 26, spin: 'off' },
  { id: 'leg', n: 'Leg-spinner', s: 0.99, xo: 0, c: 0x581c87, tw: 0.5, ao: 24, spin: 'leg' }];
export const PACE = [0, 1, 2], SPINNERS = [3, 4];

const rnd = (rng, a, b) => a + rng() * (b - a);

// Length ranges per category (spin lengths are shorter).
export function catRanges(kph, spin) {
  const [f, b] = zones(kph, spin);
  return { Full: [1.2, f - 0.15], Good: [f + 0.1, b - 0.1], Short: [b + 0.25, b + (spin ? 2.8 : 3.3)] };
}

// c: { kph, mode, drill, spin ('off'|'leg'|null), weak (category to feed more), weakP, club, hand ('R'|'L'), trademark }
// S: settings (widePct, bouncerPct).
export function genBall(S, c, rng = Math.random) {
  const r_ = (a, b) => rnd(rng, a, b);
  const o = {}; let kph = c.kph + r_(-3, 3), cat, d, lx, special = null, varn = null;
  if (c.spin) { kph = r_(72, 88); o.spin = true; o.ev = 0.58; o.eh = 0.80; o.drift = r_(-0.4, 0.4); }
  const T = catRanges(kph, !!c.spin);
  if (c.drill === 'short') cat = rng() < 0.6 ? 'Short' : (rng() < 0.5 ? 'Full' : 'Good');
  else if (c.weak && T[c.weak] && rng() < (c.weakP || 0.4)) cat = c.weak;
  else { const r = rng(); cat = r < 0.22 ? 'Full' : r < 0.62 ? 'Good' : 'Short'; }
  if (c.mode >= 2 && c.drill !== 'short') {
    const r = rng() * 100;
    if (!c.spin && r < S.bouncerPct) special = 'Bouncer';
    else if (c.spin ? r < S.widePct / 2 : r < S.bouncerPct + S.widePct) special = 'Wide off';
    if (c.weak === 'Wide off' && rng() < (c.weakP || 0.4)) special = 'Wide off';
    if (c.weak === 'Bouncer' && !c.spin && rng() < (c.weakP || 0.4)) special = 'Bouncer';
  }
  // A boss bowler's trademark ball overrides the length/line (still within real-world ranges).
  let tm = null;
  if (c.trademark && rng() < c.trademark.p) {
    tm = c.trademark; special = tm.special || null; cat = tm.cat || cat;
  }
  if (special === 'Bouncer') { d = r_(11, 13); lx = r_(-0.1, 0.2); }
  else {
    const g = tm && tm.d ? tm.d : T[cat]; d = r_(g[0], g[1]);
    if (tm && tm.lx) lx = r_(tm.lx[0], tm.lx[1]);
    else if (special === 'Wide off') lx = r_(0.36, 0.7);
    else if (c.mode === 1 || c.drill === 'short') lx = r_(-0.11, 0.11);              // all on the stumps
    else if (c.mode >= 4 && rng() < 0.15) lx = r_(-0.28, -0.14);                     // on the pads: flick
    else lx = r_(-0.2, 0.28);
  }
  // Club-level bowlers: some full tosses (never above waist), less consistent lengths, more stray lines.
  if (c.club && !tm) {
    const r2 = rng();
    if (r2 < 0.07 && special !== 'Bouncer') {
      d = r_(-(1.2 + Math.max(0, Math.min(1, (kph - 80) / 40)) * 1.4), -0.6); cat = 'Full toss';
      special = lx > 0.3 ? 'Wide off' : null; if (c.mode === 1) lx = r_(-0.11, 0.11);
    } else {
      if (special !== 'Bouncer') d = Math.max(0.5, d + r_(-0.6, 0.6));
      if (c.mode >= 2 && !special && r2 < 0.17) { lx = rng() < 0.6 ? r_(0.32, 0.8) : r_(-0.55, -0.3); if (lx > 0.3) special = 'Wide off'; }
    }
  }
  if (tm && tm.varn) {
    if (tm.varn === 'Slower ball') { varn = 'Slower ball'; kph -= r_(12, 18); }
    else if (tm.varn === 'Outswing') { varn = 'Outswing'; o.swing = -r_(2.5, 3.5); }
    else if (tm.varn === 'Inswing') { varn = 'Inswing'; o.swing = r_(2.5, 3.5); }
    else if (tm.varn === 'Arm ball') varn = 'Arm ball';
    else if (tm.varn === 'Googly' && c.spin === 'leg') varn = 'Googly';             // the leg-spinner's wrong'un: turns like an off-break
  } else if (c.mode >= 3) {
    if (c.spin) { if (rng() < 0.25) varn = 'Arm ball'; }
    else {
      const r = rng();
      if (r < 0.22) { varn = 'Slower ball'; kph -= r_(12, 18); const T2 = catRanges(kph, false); if (T2[cat] && !special && d >= 0) d = r_(T2[cat][0], T2[cat][1]); }
      else if (r < 0.45) { varn = 'Outswing'; o.swing = -r_(1.5, 3.5); }        // away from the batter (toward off)
      else if (r < 0.65) { varn = 'Inswing'; o.swing = r_(1.5, 3.5); }
      if (rng() < 0.3) { o.seam = r_(-0.6, 0.6); varn = varn ? varn + ' + seam' : 'Seam'; }
    }
  }
  // Off-break turns into a right-hander and away from a left-hander (and the leg-break the other way).
  // The physics frame is batter-relative (off = −x), so the turn's sign flips for left-handers.
  if (c.spin && varn !== 'Arm ball') o.seam = (c.spin === 'off' || varn === 'Googly' ? 1 : -1) * (c.hand === 'L' ? -1 : 1) * r_(0.6, 1.5);
  if (c.spin && !varn) varn = c.spin === 'off' ? 'Off-break' : 'Leg-break';
  o.varn = varn;
  return { d, lx, kph: Math.round(kph), opt: o, cat: special || cat, tm: tm ? tm.name || 'Trademark' : null };
}

// Release "hand cue": fuller balls come out a touch later and flatter. Halved from v4 (±5°) plus ±3° noise, so it is
// a real but unreliable pre-release cue — like real bowlers (see DECISIONS.md S5).
export function relCue(d, spin, rng = Math.random) {
  return Math.max(-5, Math.min(5, ((spin ? 4.8 : 5.5) - d) * 1.25)) + rnd(rng, -3, 3);
}
