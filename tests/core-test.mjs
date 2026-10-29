// Physics and grading tests — no dependencies. Run from the repo root:  node tests/core-test.mjs
// (Imports the app's pure core modules directly; the v4 checks are kept unchanged at the top.)
import { makeTraj, solveTraj, buildTraj, zones, Z_STUMPS, speedAt } from '../js/core/physics.js';
import { categorize, footFor, grade, gradeShot, idealShots, guessLimit, LATE_MARGIN, lateAt, targetAt, READ_WINDOW } from '../js/core/rules.js';
import { genBall, relCue, catRanges } from '../js/core/bowling.js';
import { sbResolve, sbClean, SB_ROWS, SB_DEF } from '../js/core/sandbox.js';
import { personalLine, recentBalls, evidenceText } from '../js/core/readline.js';
import { mulberry32 } from './util.mjs';
import { solve, frustum, screenCm, activeCalib } from '../js/core/calib.js';

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
  const g3 = grade(t, 'B', lateAt(t.tb, lim) + 0.005, false, 1, undefined, { guessBelow: lim, tbP: t.tb });
  ok(g3.fv === 'warn' && g3.late && !g3.read, 'right foot just after the late line = late');
  const slow = makeTraj(p0, 80, 3, 0);
  ok(Math.abs(lateAt(slow.tb, lim) - (slow.tb + LATE_MARGIN)) < 1e-9, '80 kph full ball: late is still bounce + 30 ms');
  const g4 = grade(t, 'B', t.tb + 0.02, false, 1, undefined, { guessBelow: lim, tbP: t.tb + 0.008 });
  ok(g4.fv === 'good', 'late check uses the bounce as presented on screen (frame-quantised), not the physics time');
  const g5 = grade(t, 'F', 0.2, false, 1, undefined, { guessBelow: lim });
  ok(g5.fv === 'bad' && g5.guess, 'wrong foot and a guess: still wrong, flagged as a guess');
  const s1 = gradeShot(makeTraj(p0, 110, 3, 0), 'SD', 0.2, undefined, { guessBelow: lim });
  ok(s1.v === 'warn' && s1.guess && !s1.read, 'level 4: right shot but a guess → no XP');
}


console.log('— true life-size calibration (Bink: 27" upright, 59.8 × 33.6 cm, eyes 130 cm away, eye height 150 cm) —');
{
  const base = { orient: 'portrait', hCm: 59.8, wCm: 33.6, distCm: 130, eyeCm: 150 };
  for (const bottomCm of [90, 100]) {
    const c = Object.assign({ bottomCm }, base), s = solve(c);
    console.log(`     bottom edge ${bottomCm} cm → vertical FOV ${s.vfov.toFixed(1)}° · horizontal ${s.hfov.toFixed(1)}° · bowler (1.85 m at 20 m) ${s.bowlerCm.toFixed(1)} cm tall = ${s.bowlerDeg.toFixed(2)}°`);
    console.log(`       horizon (your eye line) ${s.horizonFromBottomCm.toFixed(1)} cm up from the bottom edge (screen extends ${s.up.toFixed(1)} cm above it) · release point ${s.releaseCm.toFixed(1)} cm above the eye line · hand at top ${s.armCm.toFixed(1)} cm`);
    console.log(`       nearest ground visible ${s.nearGround.toFixed(2)} m from your eyes (pitch points beyond ~${s.nearPitchFromStumps.toFixed(1)} m from your stumps) · ${s.msg || 'no change needed'}`);
  }
  const s90 = solve(Object.assign({ bottomCm: 90 }, base)), s100 = solve(Object.assign({ bottomCm: 100 }, base));
  ok(Math.abs(s100.bowlerDeg - 5.3) < 0.05, `a 1.85 m bowler at 20 m subtends ${s100.bowlerDeg.toFixed(2)}° (real life ≈ 5.3°)`);
  ok(Math.abs(s100.bowlerCm - 12.0) < 0.1, `…which is ${s100.bowlerCm.toFixed(1)} cm on the screen at 1.3 m`);
  ok(Math.abs(s100.releaseCm - 5.17) < 0.05, `release (2.2 m at 17.6 m) sits ${s100.releaseCm.toFixed(2)} cm above the eye line`);
  ok(s90.raiseCm === 9 && /Raise your screen by 9 cm/.test(s90.msg), `bottom edge at 90 cm: "${s90.msg}"`);
  ok(s100.raiseCm === 0 && !s100.msg, 'bottom edge at 100 cm: hand on screen, no warning');
  ok(solve(Object.assign({ bottomCm: 160 }, base)).lowerCm > 0, 'screen entirely above the eyes → asks to lower it');
  // off-axis frustum: a point at eye height is exactly on the horizon row; the edges are where the physical screen is
  const c = Object.assign({ bottomCm: 100 }, base), f = frustum(c, 0.05);
  const rowFrac = (y, z) => { const ys = (y - 1.5) / z * 0.05; return (ys - f.bottom) / (f.top - f.bottom); };   // 0 = bottom edge, 1 = top
  ok(Math.abs(rowFrac(1.5, 50) - 50 / 59.8) < 1e-9, `eye-height point projects ${(rowFrac(1.5, 50) * 59.8).toFixed(1)} cm up the screen = the eye line`);
  ok(Math.abs(rowFrac(2.2, 17.6) * 59.8 - (50 + screenCm(c, 2.2, 17.6))) < 1e-9, 'release point lands where the calibration screen says');
  ok(Math.abs((f.right - f.left) / (f.top - f.bottom) - 33.6 / 59.8) < 1e-9, 'frustum aspect = physical screen aspect');
  ok(activeCalib({ calib: { portrait: c } }, true) === c && activeCalib({ calib: { portrait: c } }, false) === null, 'one calibration per orientation');
}

console.log('— release heights (the real rig, posed at release) —');
{
  await import('./three-hook.mjs');
  const THREE = await import('three'), { createBowler } = await import('../js/engine/bowler.js'), { BOWLERS } = await import('../js/core/bowling.js');
  const { T_REL } = await import('../js/core/physics.js'), b = createBowler(new THREE.Scene()), v = new THREE.Vector3();
  for (const p of BOWLERS) {
    b.pose(T_REL, p, 0, 0); b.handWorld(v);
    const [lo, hi] = p.spin ? [1.9, 2.0] : [2.1, 2.3];
    ok(v.y >= lo && v.y <= hi, `${p.n} (size ${p.s}) releases at ${v.y.toFixed(2)} m (target ${lo}–${hi})`);
  }
}

console.log('— a real read is always possible (Bink: "too quick" when moving after release) —');
{
  let worst = 1, where = '';
  for (const rt of [0.262, 0.35, null]) for (const [k, spin] of [[80, false], [100, false], [120, false], [140, false], [80, true]]) {
    const [f, b] = zones(k, spin), lim = guessLimit(rt);
    for (const d of [2, f - 0.3, (f + b) / 2, b + 1, spin ? b + 2 : 12]) {
      const t = makeTraj(spin ? ps : p0, k, d, 0, spin ? { spin: true, ev: 0.58, eh: 0.8 } : {});
      const win = lateAt(t.tb, lim) - lim; if (win < worst) { worst = win; where = `${k} kph ${spin ? 'spin' : 'pace'} ${d.toFixed(1)} m rt ${rt}`; }
      const fe = footFor(t), foot = fe === 'FB' ? 'F' : fe, g = grade(t, foot, lim + 0.06, false, 1, undefined, { guessBelow: lim, tbP: t.tb });
      if (g.guess || g.late) { worst = -1; where = `answer at line + 60 ms graded ${g.guess ? 'guess' : 'late'} (${k} kph ${d.toFixed(1)} m)`; }
      if (targetAt(k, lim) <= lim) { worst = -1; where = `target inside the too-quick zone at ${k} kph`; }
    }
  }
  ok(worst >= READ_WINDOW - 1e-9, `≥150 ms between "too quick" and "late" at every pace and length, target after the line (worst ${(worst * 1000).toFixed(0)} ms${where ? ', ' + where : ''})`);
  const t = makeTraj(p0, 120, 9.4, 0), lim = guessLimit(0.262), g = grade(t, 'B', 0.33, false, 1, undefined, { guessBelow: lim, tbP: t.tb });
  ok(g.fv === 'good' && g.read, `120 kph short ball, back foot 0.33 s after release (reaction 262 ms) = good read (was: ${t.tb.toFixed(2)} s bounce left 12 ms)`);
  ok(Math.abs(guessLimit(0.45) - 0.35) < 1e-9 && Math.abs(guessLimit(0.12) - 0.23) < 1e-9, 'a slow or odd reaction test is clamped (guess line 0.23–0.35 s)');
  const gq = grade(t, 'B', 0.2, false, 1, undefined, { guessBelow: lim, tbP: t.tb });
  ok(gq.guess && /200 ms after release/.test(gq.fmsg) && /312 ms/.test(gq.fmsg), 'still a guess at 0.20 s, and the card says the numbers: ' + gq.fmsg);
}

console.log('— personal too-quick line, learned from your own balls —');
{
  const rng = mulberry32(11), mk = (rt, right) => { const fe = rng() < 0.5 ? 'F' : 'B'; return { fe, foot: right ? fe : (fe === 'F' ? 'B' : 'F'), rt, occ: null }; };
  const fastReader = Array.from({ length: 60 }, () => { const rt = 0.08 + rng() * 0.25; return mk(rt, rng() < 0.95); });
  const p1 = personalLine(fastReader, 0.216);
  ok(p1.personal && p1.line <= 0.13, `fast presses that are 95% right: line drops to ${p1.line.toFixed(2)} s (default ${p1.def.toFixed(3)})`);
  const guesser = Array.from({ length: 60 }, () => { const rt = 0.05 + rng() * 0.4; return mk(rt, rt > 0.27 ? rng() < 0.95 : rng() < 0.5); });
  const p2 = personalLine(guesser, 0.216);
  ok(!p2.personal || p2.line >= 0.24, `fast presses that are coin flips keep the line (${p2.line.toFixed(2)} s; fast ${Math.round(100 * p2.fastAcc)}% right)`);
  const few = personalLine(fastReader.slice(0, 30), 0.216);
  ok(!few.personal && few.line === few.def && /After 40 balls/.test(evidenceText(few)), 'fewer than 40 balls: the reaction-test line is kept');
  const tooFast = Array.from({ length: 60 }, () => mk(0.02 + rng() * 0.05, true));
  ok(personalLine(tooFast, 0.216).line >= 0.12, 'never below 0.12 s (human visual–motor limit)');
  ok(personalLine(fastReader.map(b => Object.assign({}, b, { fe: 'FB' })), 0.216).n === 0, 'either-foot balls are not evidence');
  const t = makeTraj(p0, 120, 9.4, 0);
  ok(lateAt(t.tb, p1.line) - p1.line >= READ_WINDOW - 1e-9, 'the read window still holds with a personal line');
  const g = grade(t, 'B', 0.15, false, 1, undefined, { guessBelow: p1.line, tbP: t.tb, ev: p1 });
  ok(g.fv === 'good' && !g.guess, 'with a learned line, a right foot at 0.15 s is a good read');
  const gg = grade(t, 'B', 0.08, false, 1, undefined, { guessBelow: p2.line, tbP: t.tb, ev: p2 });
  ok(gg.guess && /right \d+% of the time/.test(gg.fmsg), 'a coin-flip guess says why: ' + gg.fmsg);
  const ss = [{ balls: [1, 2] }, { balls: [3] }];
  ok(recentBalls(ss, [4]).join() === '1,2,3,4', 'recent balls: newest last, current session included');
}

console.log('— sandbox: pick every ball —');
{
  const rng = mulberry32(7), S = { bouncerPct: 8, widePct: 22 };
  const fixed = { bowler: 'pace', kph: 120, len: 'Short', line: 'stumps', occ: 'none', task: 1 };
  const r = sbResolve(fixed, rng);
  ok(r.spin === null && r.kph === 120 && r.cat === 'Short' && r.line === 'stumps' && r.occ === null && r.mode === 1, 'fixed choices are used as given');
  const seen = {}; for (const row of SB_ROWS) seen[row.k] = new Set();
  for (let i = 0; i < 600; i++) { const x = sbResolve(SB_DEF, rng); seen.bowler.add(x.spin || 'pace'); seen.kph.add(x.kph); seen.len.add(x.cat); seen.line.add(x.line); seen.occ.add(x.occ === null ? 'none' : x.occ); seen.task.add(x.mode); }
  ok(SB_ROWS.every(row => row.o.every(([v]) => seen[row.k].has(v))), 'Random rolls every option in every row (600 balls)');
  ok(sbResolve({ bowler: 'off', len: 'Bouncer' }, rng).cat === 'Short', 'a spinner asked for a bouncer bowls short instead');
  ok(sbClean({ kph: 125, len: 'Yorker', task: 4 }).kph === 'rand' && sbClean({ task: 4 }).task === 4 && sbClean(null).len === 'rand', 'unknown choices fall back to Random');
  let good = true, why = '';
  for (const [kph, spin] of [[80, null], [120, null], [140, null], [80, 'off'], [80, 'leg']]) for (const cat of ['Full', 'Good', 'Short']) for (const line of ['stumps', 'pads', 'off']) for (const mode of [1, 2, 4]) {
    for (let i = 0; i < 20; i++) {
      const g = genBall(S, { kph, mode, spin, hand: 'R', force: { cat, line } }, rng), T = catRanges(g.kph, !!spin)[cat];
      const L = { stumps: [-0.11, 0.11], pads: [-0.28, -0.14], off: [0.36, 0.7] }[line];
      if (!(g.d >= T[0] && g.d <= T[1]) || !(g.lx >= L[0] && g.lx <= L[1])) { good = false; why = `${kph} ${spin} ${cat} ${line}: d ${g.d.toFixed(2)} lx ${g.lx.toFixed(2)}`; }
    }
  }
  ok(good, 'forced length and line land inside their zones at 80/120/140 kph and for both spinners' + (why ? ' — ' + why : ''));
  const b = genBall(S, { kph: 130, mode: 2, force: { cat: 'Bouncer', line: 'stumps' } }, rng), ft = genBall(S, { kph: 100, mode: 1, force: { cat: 'Full toss', line: 'stumps' } }, rng);
  ok(b.d >= 11 && b.cat === 'Bouncer' && ft.d < 0 && ft.cat === 'Full toss', 'bouncer pitches 11–13 m out; full toss lands beyond the batter');
  ok(genBall(S, { kph: 110, mode: 2, force: { cat: 'Good', line: 'off' } }, rng).cat === 'Wide off', 'outside off is reported as a leave ball');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
