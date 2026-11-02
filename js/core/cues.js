// Pre-release cues: what a batter can pick up before the ball leaves the hand. Pure (tested in Node).
// Every cue is weak and noisy on purpose (DECISIONS S5, C11): on its own it predicts the ball only ~55–65% of the time,
// like real bowlers who disguise their stock and their variations. 'strong' makes them obvious, for learning what to look at.
//   bound  (−1…1): a longer, higher bound into the crease before a short ball, a flatter one before a full ball
//   arm    (≈0.85…1): arm speed through the delivery; < 1 = slower arm before a slower ball (but not always, and not only then)
//   rel    (deg): release-angle offset, the existing hand cue (relCue) — fuller balls come out a touch later and flatter
// None of them changes the release point or the flight: the physics stays exact.
import { zones } from './physics.js';
import { relCue } from './bowling.js';

export const CUE_LEVELS = ['off', 'real', 'strong'];
const gauss = (rng) => { let u = 0; for (let i = 0; i < 6; i++) u += rng(); return (u - 3) / Math.sqrt(0.5); };   // ≈ N(0,1)

// g: a generated ball { d, kph, opt: { spin, varn } }. Returns { bound, arm, rel, short, full, slower }.
export function makeCues(g, level = 'real', rng = Math.random) {
  const spin = !!(g.opt && g.opt.spin), [f, b] = zones(g.kph, spin);
  const short = g.d >= b, full = g.d >= 0 && g.d <= f, slower = !!(g.opt && g.opt.varn && /Slower/.test(g.opt.varn));
  if (level === 'off') return { bound: 0, arm: 1, rel: rnd(rng, -3, 3), short, full, slower };
  const k = level === 'strong' ? 3 : 1;
  // bound: signal ±0.25 against noise σ = 1 → sign(bound) predicts short vs full ≈ 60% (Φ(0.25))
  const sig = short ? 0.25 : full ? -0.25 : 0;
  const bound = clamp(sig * k + gauss(rng) * (level === 'strong' ? 0.35 : 1), -1, 1);
  // arm: half of the slower balls show a slower arm; a fifth of stock balls do too (a tired or a disguising bowler)
  const slowArm = slower ? rng() < (level === 'strong' ? 0.95 : 0.5) : rng() < (level === 'strong' ? 0.03 : 0.2);
  const arm = slowArm ? 0.86 + 0.04 * rng() : 1 - 0.03 * rng();
  const rel = level === 'strong' ? relCue(g.d, spin, () => 0.5) * 1.6 : relCue(g.d, spin, rng);
  return { bound, arm, rel, short, full, slower };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rnd = (rng, a, b) => a + rng() * (b - a);
