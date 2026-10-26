// Physics and grading tests — no dependencies. Run from the repo root:  node tests/core-test.mjs
// (Imports the app's pure core modules directly; the v4 checks are kept unchanged at the top.)
import { makeTraj, solveTraj, buildTraj, zones, Z_STUMPS, speedAt } from '../js/core/physics.js';
import { categorize, footFor, grade, gradeShot, idealShots, guessLimit, LATE_MARGIN } from '../js/core/rules.js';
import { genBall, relCue } from '../js/core/bowling.js';
import { mulberry32 } from './util.mjs';

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const p0 = { x: -0.57, y: 2.16, z: 17.6 }, ps = { x: -0.4, y: 2.05, z: 17.9 };
const pitch = tr => tr.pos(tr.tb).z - Z_STUMPS;

console.log('— v4 checks —');
// 1. ball pitches where asked, finishes on the asked line, even with swing/seam/spin
for (const [k, d, lx, o] of [[80, 5, 0, {}], [120, 8, 0, {}], [110, 5, 0.05, { swing: -3 }], [110, 5, 0.05, { swing: 3 }], [110, 8, 0, { seam: 0.6 }],
  [80, 4.5, 0, { spin: true, ev: .58, eh: .8, drift: .3, seam: 1.5 }], [100, -1.5, 0, {}]]) {
  const tr = makeTraj(k === 80 && o.spin ? ps : p0, k, d, lx, o);
  ok(Math.abs(pitch(tr) - d) < 0.06, `pitches at ${d} m (${k} kph ${JSON.stringify(o)}) → ${pitch(tr).toFixed(2)}`);
  ok(Math.abs(tr.lxArr - lx) < 0.01, `  line at stumps ${lx} → ${tr.lxArr.toFixed(3)}`);
}
// 2. air drag: arrives ~15–18% slower than release
{ const tr = makeTraj(p0, 120, 5, 0), v = speedAt(tr, tr.ta); ok(v > 95 && v < 106, `120 kph arrives at ${v.toFixed(0)} kph`); }
// 3. pace-based zones
ok(JSON.stringify(zones(80, false).map(x => +x.toFixed(2))) === '[4.8,6.3]', 'zones 80 kph = 4.8 / 6.3');
ok(JSON.stringify(zones(140, false).map(x => +x.toFixed(2))) === '[6,8]', 'zones 140 kph = 6.0 / 8.0');
ok(JSON.stringify(zones(80, true)) === '[4.8,6]', 'zones spin = 4.8 / 6.0');
// 4. foot decisions
{ const t = makeTraj(p0, 80, 8, 0); ok(footFor(t) === 'B' && grade(t, 'F', 0.1, false, 1).fv === 'bad', '80 kph, 8 m → back; forward is wrong'); }
{ const t = makeTraj(p0, 120, 4.5, 0); ok(footFor(t) === 'F', '120 kph, 4.5 m → front'); }
{ const t = makeTraj(p0, 100, 6, 0); ok(footFor(t) === 'FB', '100 kph, 6 m → either'); }
// 5. play/leave
{ const t = makeTraj(p0, 110, 5, 0); ok(grade(t, 'F', 0.1, false, 2).pv === 'bad', 'leaving a ball hitting the stumps is wrong'); }
{ const t = makeTraj(p0, 110, 8, 0.5); ok(grade(t, 'B', 0.1, true, 2).pv === 'bad' && grade(t, 'B', 0.1, false, 2).v === 'good', 'wide one: leave right, play wrong'); }
// 6. shot choice
{ const t = makeTraj(p0, 110, 3, 0); ok(idealShots(t).best[0] === 'SD', 'half-volley → straight drive'); }
{ const t = makeTraj(p0, 120, 10.2, 0); ok(idealShots(t).best[0] === 'PU', 'waist-high short → pull'); }
{ const t = makeTraj(p0, 120, 12.5, 0); ok(categorize(t) === 'Bouncer' && idealShots(t).best[0] === 'LV', 'bouncer → leave'); }
// 7. full tosses never above waist (≈1.0 m)
{ const S = { widePct: 22, bouncerPct: 8 }; let mx = 0;
  for (const c of [{ kph: 80, mode: 2, club: true }, { kph: 120, mode: 2, club: true }]) for (let i = 0; i < 1500; i++) {
    const g = genBall(S, c); if (g.cat !== 'Full toss') continue; mx = Math.max(mx, makeTraj(p0, g.kph, g.d, g.lx, g.opt).yC); }
  ok(mx < 1.0, `max full-toss height ${mx.toFixed(2)} m`); }

console.log('— solver accuracy & speed —');
{ const rng = mulberry32(7), S = { widePct: 22, bouncerPct: 8 }; let worstD = 0, worstL = 0, evals = 0, n = 0;
  const t0 = performance.now();
  for (let i = 0; i < 400; i++) {
    const spin = i % 4 === 0 ? (i % 8 === 0 ? 'off' : 'leg') : null, mode = 1 + (i % 4);
    const g = genBall(S, { kph: 80 + (i % 7) * 10, mode, spin, club: true, hand: i % 2 ? 'L' : 'R' }, rng);
    const tr = makeTraj(spin ? ps : p0, g.kph, g.d, g.lx, g.opt);
    worstD = Math.max(worstD, Math.abs(pitch(tr) - g.d)); worstL = Math.max(worstL, Math.abs(tr.lxArr - g.lx)); evals += tr.evals; n++;
  }
  const ms = (performance.now() - t0) / n;
  ok(worstD < 0.01, `400 random balls pitch within 1 cm of target (worst ${(worstD * 100).toFixed(2)} cm)`);
  ok(worstL < 0.005, `400 random balls finish within 5 mm of the line (worst ${(worstL * 1000).toFixed(1)} mm)`);
  ok(evals / n < 40, `solver uses ${(evals / n).toFixed(1)} flights per ball (v4 used ~150)`);
  ok(ms < 5, `solve time ${ms.toFixed(2)} ms per ball in Node (runs in a worker in the app)`);
}
{ // worker round trip: plain data (structured clone) rebuilds the same path
  const raw = solveTraj(p0, 115, 6.5, 0.1, { swing: -2 }), copy = buildTraj(structuredClone(raw)), ref = makeTraj(p0, 115, 6.5, 0.1, { swing: -2 });
  const a = copy.pos(0.31), b = ref.pos(0.31);
  ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) < 1e-6 && copy.fmax === ref.fmax, 'trajectory data survives the worker round trip');
}

console.log('— realism ranges —');
for (const k of [80, 100, 120, 145]) { const tr = makeTraj(p0, k, 6, 0), loss = 1 - speedAt(tr, tr.ta) / k;
  ok(loss > 0.10 && loss < 0.22, `${k} kph loses ${(loss * 100).toFixed(0)}% speed by the stumps (real: ~12–20%)`); }
{ const slow = makeTraj(p0, 80, 12, 0), fast = makeTraj(p0, 120, 12, 0);
  ok(slow.yC < 1.30 && fast.yC >= 1.30, `12 m: 80 kph reaches ${slow.yC.toFixed(2)} m (no bouncer), 120 kph ${fast.yC.toFixed(2)} m (bouncer)`); }
{ const off = makeTraj(ps, 80, 4.5, 0, { spin: true, ev: .58, eh: .8, seam: 1.5 }), plain = makeTraj(ps, 80, 4.5, 0, { spin: true, ev: .58, eh: .8 });
  const turn = Math.abs(off.pos(off.tb).x - plain.pos(plain.tb).x); ok(turn > 0.03 && turn < 0.6, `big off-break: aim shifts ${(turn * 100).toFixed(0)} cm to finish on the same line`); }
{ const sw = makeTraj(p0, 120, 4, 0, { swing: -3.5 }), st = makeTraj(p0, 120, 4, 0);
  const late = Math.abs(sw.pos(sw.tb).x - st.pos(st.tb).x); ok(late > 0.02 && late < 0.5, `late swing moves the ball ${(late * 100).toFixed(0)} cm by pitching (real: up to ~0.5 m)`); }
{ const tr = makeTraj(p0, 120, 6, 0); ok(tr.ta > 0.5 && tr.ta < 0.75, `120 kph reaches the stumps in ${tr.ta.toFixed(3)} s (real: ~0.6 s)`); }

console.log('— left-handers —');
{ const rng = mulberry32(3), S = { widePct: 22, bouncerPct: 8 };
  const r = genBall(S, { kph: 80, mode: 1, spin: 'off', hand: 'R' }, mulberry32(3)), l = genBall(S, { kph: 80, mode: 1, spin: 'off', hand: 'L' }, mulberry32(3));
  ok(r.opt.seam > 0 && l.opt.seam < 0 && Math.abs(r.opt.seam + l.opt.seam) < 1e-9, 'off-break turns in to a right-hander and away from a left-hander');
  void rng; }

console.log('— hand cue —');
{ const rng = mulberry32(11); let mx = 0; for (let i = 0; i < 2000; i++) mx = Math.max(mx, Math.abs(relCue(rng() * 14 - 1, false, rng))); ok(mx <= 8.0001, `release cue stays within ±8° (5° cue + 3° noise): max ${mx.toFixed(1)}°`); }

console.log('— guess / late (presented times) —');
{ const t = makeTraj(p0, 100, 8.5, 0), lim = guessLimit(0.262);
  ok(Math.abs(lim - 0.312) < 1e-9, 'guess limit = reaction 0.262 + 0.05 s');
  const g1 = grade(t, 'B', 0.25, false, 1, undefined, { guessBelow: lim, tbP: t.tb });
  ok(g1.fv === 'warn' && g1.guess && !g1.read && g1.sc === 0.5, 'right foot at 0.25 s (faster than a real read) = guess: half score, no XP');
  const g2 = grade(t, 'B', 0.40, false, 1, undefined, { guessBelow: lim, tbP: t.tb });
  ok(g2.fv === 'good' && g2.read, 'right foot at 0.40 s = a real read');
  const g3 = grade(t, 'B', t.tb + LATE_MARGIN + 0.005, false, 1, undefined, { guessBelow: lim, tbP: t.tb });
  ok(g3.fv === 'warn' && g3.late && !g3.read, 'right foot just after bounce + 30 ms = late');
  const g4 = grade(t, 'B', t.tb + 0.02, false, 1, undefined, { guessBelow: lim, tbP: t.tb + 0.008 });
  ok(g4.fv === 'good', 'late check uses the bounce as presented on screen (frame-quantised), not the physics time');
  const g5 = grade(t, 'F', 0.2, false, 1, undefined, { guessBelow: lim });
  ok(g5.fv === 'bad' && g5.guess, 'wrong foot and a guess: still wrong, flagged as a guess');
  const s1 = gradeShot(makeTraj(p0, 110, 3, 0), 'SD', 0.2, undefined, { guessBelow: lim });
  ok(s1.v === 'warn' && s1.guess && !s1.read, 'level 4: right shot but a guess → no XP');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
