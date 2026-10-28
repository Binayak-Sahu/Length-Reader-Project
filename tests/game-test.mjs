// Game logic and saved-data tests: level staircase, XP rules, v4 migration/import, compaction, streaks, quality.
// Run: node tests/game-test.mjs
import { stairStep, MAX_LEVEL, LEVELS } from '../js/core/levels.js';
import { makeTraj } from '../js/core/physics.js';
import { grade, footFor, guessLimit } from '../js/core/rules.js';
import { genBall } from '../js/core/bowling.js';
import { xpForBall, sessionXP, streak, week, summarize, progressData } from '../js/core/progress.js';
import { load, save, importData, exportData, newDB, KEY, V4_KEY, normalize } from '../js/core/store.js';
import { QualityController, tierIndex } from '../js/core/quality.js';
import { BOSSES, careerState, recordTrial, TIERS } from '../js/core/career.js';
import { checkBadges, BADGES } from '../js/core/badges.js';
import { isHitting, categorize } from '../js/core/rules.js';
import { mulberry32, makeOk, fakeStorage } from './util.mjs';
import { syncPayload, mergeSynced } from '../js/core/sync.js';
const { ok, done } = makeOk('game');

console.log('— level staircase (85% rule) —');
function simulate(rule, slope, seed, N = 150000) {
  const rng = mulberry32(seed); let lvl = 0, d = 0.5, win = [], sum = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const p = Math.max(0.3, Math.min(0.99, 1.02 - slope * lvl));
    const sc = rng() < p ? (rng() < 0.1 ? 0.5 : 1) : 0;
    if (i > 3000) { sum += sc; n++; }
    if (rule === 'v4') { win.push(sc); if (win.length >= 8) { const a = win.slice(-8).reduce((x, y) => x + y, 0) / 8;
      if (a >= 0.8 && lvl < MAX_LEVEL) { lvl++; win = []; } else if (a <= 0.5 && lvl > 0) { lvl--; win = []; } } }
    else { const r = stairStep(lvl, d, sc); lvl = r.level; d = r.d; }
  }
  return sum / n;
}
for (const slope of [0.03, 0.06]) {
  const v4 = simulate('v4', slope, 1), v5 = simulate('v5', slope, 1);
  ok(v5 > 0.82 && v5 < 0.88, `learner slope ${slope}: new staircase holds success at ${(v5 * 100).toFixed(1)}% (target 85%)`);
  ok(v4 < 0.75, `  (v4's 8-ball rule held ${(v4 * 100).toFixed(1)}% — why it was replaced)`);
}
{ let s = { level: 3, d: 0.5 }, n = 0; while (s.level === 3) { s = stairStep(s.level, s.d, 1); n++; }
  ok(n === 7 && s.level === 4, `7 perfect balls from mid-step move you up (took ${n})`); }
{ let s = stairStep(3, 0.5, 0); s = stairStep(s.level, s.d, 0); ok(s.level === 2, 'two wrong balls in a row from mid-step move you down'); }
ok(LEVELS.length === 28 && LEVELS[9].n.startsWith('L2') && LEVELS[23].n.startsWith('L4'), 'same 28 steps as v4 (saved levels carry over)');

console.log('— XP rewards real reads only —');
{ // Simulate 3000 L1 balls for three batters: an honest reader (90% right, reads at ~0.40 s),
  // a fast guesser (random foot at 0.15 s) and a patient guesser (random foot at 0.45 s, dodging the guess rule).
  const rng = mulberry32(42), S = { widePct: 0, bouncerPct: 0 }, p0 = { x: -0.57, y: 2.16, z: 17.6 }, lim = guessLimit(0.262);
  const xp = { honest: 0, fast: 0, patient: 0 };
  for (let i = 0; i < 3000; i++) {
    const g = genBall(S, { kph: 100, mode: 1 }, rng), tr = makeTraj(p0, g.kph, g.d, g.lx, g.opt), fe = footFor(tr);
    const right = fe === 'FB' ? 'F' : fe, wrong = right === 'F' ? 'B' : 'F', rand = rng() < 0.5 ? 'F' : 'B';
    const opt = { guessBelow: lim, tbP: tr.tb };
    const add = (who, foot, rt) => { const r = grade(tr, foot, rt, false, 1, undefined, opt); if (r.read) xp[who] += xpForBall({ lvl: 2 }); };
    add('honest', rng() < 0.9 ? right : wrong, 0.36 + rng() * 0.1);
    add('fast', rand, 0.15);
    add('patient', rand, 0.45);
  }
  ok(xp.fast === 0, `pressing fast earns nothing (fast guesser: ${xp.fast} XP)`);
  ok(xp.patient < 0.8 * xp.honest, `random guessing that waits earns ${Math.round(100 * xp.patient / xp.honest)}% of an honest 90% reader's XP`);
}
ok(xpForBall({ lvl: 0 }) === 10 && xpForBall({ lvl: 27 }) === 18 && xpForBall({ lvl: 0 }, 1.5) === 15, 'XP: 10 at the first step, 18 at the last, 1.5× under nets rules');

console.log('— v4 data migration —');
const v4ball = (o) => Object.assign({ d: 8.2, lx: 0.02, lxB: 0.03, kph: 80, occ: null, lvl: 0, mode: 1, cat: 'Short', bowler: 'Tall quick', spin: false, varn: null,
  fed: null, trig: null, tv: null, foot: 'B', shot: null, rt: 0.39, read: 0.128, played: false, fe: 'B', fv: 'good', pe: null, pv: null, v: 'good', sc: 1 }, o);
const v4 = {
  settings: { maxKph: 115, view: 'life', trigger: false, rotate: 'ball', club: true, netsGap: 20, spinners: true, hawk: true, smart: true,
    lifeCm: 60, lifeM: 1.5, boost: 1.8, gap: 2.5, widePct: 22, bouncerPct: 8, levelMode: 'auto', sound: true, voice: false, fullscreen: true, junk: 1 },
  sessions: [
    { date: '2026-10-25T09:00:00.000Z', drill: 'nets', match: null, n: 3, score: 67, peak: 0, end: 0, bestStreak: 2,
      balls: [v4ball(), v4ball({ cat: 'Full', d: 3.1, foot: 'F', fe: 'F' }), v4ball({ foot: 'F', fv: 'bad', v: 'bad', sc: 0, read: null })] },
    { date: '2026-10-26T08:00:00.000Z', drill: null, match: null, n: 2, score: 100, peak: 1, end: 1, bestStreak: 2,
      balls: [v4ball(), v4ball({ rt: 0.2, read: 0 })] }],
  level: 1, rtBase: 0.262, cs: { pace: { Short: [1, 0, 1] }, spin: {} }, trigOffV1: 1,
};
{
  const st = fakeStorage({ [V4_KEY]: JSON.stringify(v4) });
  const { db, added, fromV4 } = load(st);
  ok(fromV4 && added === 2 && db.sessions.length === 2, 'v4 sessions carried over on first start');
  ok(db.settings.maxKph === 115 && db.settings.view === 'life' && db.settings.voice === false && db.settings.junk === undefined, 'v4 settings carried over (unknown keys dropped)');
  ok(db.level === 1 && db.rtBase === 0.262 && db.cs.pace.Short.length === 3, 'level, reaction time and smart-feeding stats carried over');
  ok(db.profile.onboarded === true, 'a v4 player skips the beginner tutorial');
  ok(db.sessions[0].xp === 30 && db.sessions[1].xp === 10, `retro XP: nets reads 1.5×, the 0.20 s answer counted as a guess (got ${db.sessions[0].xp}, ${db.sessions[1].xp})`);
  ok(st.getItem(V4_KEY) === JSON.stringify(v4), 'v4 save left untouched (fallback still works)');
  save(st, db);
  // v4 used again as a fallback: one new session appears in lr_v3 → only that one is merged next start
  const v4b = JSON.parse(JSON.stringify(v4)); v4b.sessions.push({ date: '2026-10-27T08:00:00.000Z', drill: 'short', n: 1, score: 100, peak: 1, end: 1, bestStreak: 1, balls: [v4ball()] });
  st.setItem(V4_KEY, JSON.stringify(v4b));
  const r2 = load(st);
  ok(r2.added === 1 && r2.db.sessions.length === 3 && !r2.fromV4, 'later v4 sessions merged once, no duplicates');
  const r3 = load(fakeStorage({ [KEY]: JSON.stringify(r2.db), [V4_KEY]: JSON.stringify(v4b) }));
  ok(r3.added === 0 && r3.db.sessions.length === 3, 'nothing merged twice');
}
{
  const db = newDB();
  const added = importData(db, { app: 'length-reader', version: 1, exported: '2026-10-26', level: 4, sessions: v4.sessions }, 'v4.json');
  ok(added === 2 && db.level === 4, 'imports a v4 export file (sessions + level)');
  ok(importData(db, { app: 'length-reader', version: 1, level: 1, sessions: v4.sessions }) === 0 && db.level === 4, 're-importing adds nothing and never lowers the level');
  const out = JSON.parse(JSON.stringify(exportData(db))), db2 = newDB();
  db.badges.first = '2026-10-26'; const out2 = JSON.parse(JSON.stringify(exportData(db)));
  ok(importData(db2, out2) === 2 && db2.badges.first && db2.level === 4, 'v5 export → import round trip (sessions, badges, level)');
  { const a = newDB(), b = newDB(); a.level = 4; b.level = 9; mergeSynced(a, syncPayload(b)); const c = newDB(); c.level = 12; mergeSynced(c, syncPayload(b));
    ok(a.level === 9 && c.level === 12, 'sync: old saves with no level date take the higher level'); }
  let threw = false; try { importData(newDB(), { hello: 1 }); } catch (e) { threw = true; } ok(threw, 'rejects files that are not Length Reader data');
  void out;
}
{
  const st = fakeStorage({ [KEY]: '{not json', [V4_KEY]: 'also not json' }); const { db, fresh } = load(st);
  ok(fresh && db.sessions.length === 0, 'corrupt saves fall back to a fresh start instead of crashing');
}

console.log('— quota and compaction —');
{
  const db = newDB();
  for (let i = 0; i < 120; i++) db.sessions.push({ date: new Date(Date.UTC(2026, 6, 1) + i * 864e5).toISOString(), n: 50, score: 80, xp: 300, end: 0,
    balls: Array.from({ length: 50 }, () => v4ball()) });
  const st = fakeStorage({}, 600_000);
  ok(save(st, db), 'save succeeds under a tight quota by dropping old ball detail');
  const back = normalize(JSON.parse(st.getItem(KEY)));
  ok(back.sessions.length === 120 && back.sessions.slice(-5).every(s => s.balls.length === 50), 'every session kept; the newest keep full detail');
  ok(back.sessions[0].sum && back.sessions[0].sum.n === 50 && back.sessions[0].xp === 300, 'compacted sessions keep their summary and XP');
  ok(progressData(back).length === 120, 'progress chart still has every day');
}

console.log('— streak & weekly goal —');
{
  const db = newDB(), day = d => new Date(2026, 9, d, 18).toISOString();
  for (const d of [20, 22, 23, 24, 25]) db.sessions.push({ date: day(d), n: 30, balls: [] });
  db.sessions.push({ date: day(26), n: 10, balls: [] });                   // today: only 10 balls so far
  const now = new Date(2026, 9, 26, 20);
  ok(streak(db, now) === 4, `streak counts back from yesterday while today isn't done (got ${streak(db, now)})`);
  const w = week(db, now);
  ok(w.length === 7 && w[0].k === '2026-10-26' && !w[0].done, 'week starts Monday (26 Oct 2026 is a Monday)');
  db.sessions.push({ date: day(26), n: 15, balls: [] });
  ok(streak(db, now) === 5 && week(db, now)[0].done, '25 balls today → today counts');
}
ok(summarize([v4ball(), v4ball({ fv: 'bad', v: 'bad', sc: 0 })]).reads === 1, 'summary counts reads');

console.log('— adaptive quality —');
{
  const q = new QualityController(tierIndex('high'));
  ok(q.onBall({ frames: 400, drops: 30, cpuP95: 3, budget: 8.33 }) === tierIndex('medium'), 'drops more than 2% of frames → one tier down');
  ok(q.onBall({ frames: 400, drops: 0, cpuP95: 2, budget: 8.33 }) === null && q.onBall({ frames: 400, drops: 0, cpuP95: 2, budget: 8.33 }) === null, 'needs 3 clean balls to try a tier up');
  ok(q.onBall({ frames: 400, drops: 0, cpuP95: 2, budget: 8.33 }) === null, 'and won’t retry a tier that just failed');
  for (let i = 0; i < 20; i++) q.onBall({ frames: 400, drops: 0, cpuP95: 2, budget: 8.33 });
  ok(q.tier === tierIndex('high'), 'retries the failed tier after 20 balls');
  ok(new QualityController(1).onBall({ frames: 400, drops: 0, cpuP95: 7, budget: 6.06 }) === 0, 'CPU over 85% of a 165 Hz budget → down');
}

console.log('— career ladder & boss bowlers —');
{
  const db = newDB(); db.level = 1;
  let cs = careerState(db);
  ok(cs.name === 'Gully' && cs.next.id === 'metronome' && !cs.unlocked, 'start in the gully; the Club trial is locked until training reaches L1 · 100 kph');
  db.level = 2; cs = careerState(db);
  ok(cs.unlocked, 'reaching L1 · 100 kph unlocks the Club trial');
  const fail = recordTrial(db, BOSSES[0], 75, 'x1');
  ok(!fail.passed && db.career.tier === 0 && db.bosses.metronome === 75, '75% fails the trial (80% needed) but the best score is kept');
  const pass = recordTrial(db, BOSSES[0], 83, 'x2');
  ok(pass.passed && pass.promoted && db.career.tier === 1 && TIERS[db.career.tier] === 'Club', '83% passes: promoted to Club');
  ok(!recordTrial(db, BOSSES[2], 90, 'x3').promoted && db.career.tier === 1, 'beating a boss two rungs up does not skip a tier');
  ok(BOSSES.every((b, i) => b.tier === i + 1) && BOSSES.map(b => b.unlock).every((u, i, a) => i === 0 || u >= a[i - 1]), 'five bosses, one per promotion, unlocking in order');
}
{ // each trademark ball really tests what the boss card says (physics + grading, not just labels)
  const S = { widePct: 22, bouncerPct: 8 }, p0 = { x: -0.57, y: 2.16, z: 17.6 }, ps = { x: -0.4, y: 2.05, z: 17.9 };
  const tmBalls = (b, n = 300) => { const rng = mulberry32(b.tier * 7), out = [];
    for (let i = 0; i < n; i++) { const g = genBall(S, { kph: b.spec.k, mode: b.spec.m, spin: b.prof.spin || null, hand: 'R', trademark: Object.assign({}, b.trademark, { p: 1 }) }, rng);
      out.push({ g, tr: makeTraj(b.prof.spin ? ps : p0, g.kph, g.d, g.lx, g.opt) }); } return out; };
  const [met, hus, swi, mag, exp] = BOSSES.map(b => tmBalls(b));
  ok(met.every(x => footFor(x.tr) === 'B'), 'The Metronome’s back-of-a-length ball always needs the back foot at 100 kph');
  ok(hus.every(x => footFor(x.tr) === 'B') && hus.filter(x => isHitting(x.tr)).length > 0.6 * hus.length, 'The Hustler: short at the body — back foot, and mostly hitting (must play)');
  const wide = swi.filter(x => x.tr.lxArr > 0.30).length;
  ok(swi.every(x => footFor(x.tr) === 'F') && wide > 0.2 * swi.length && wide < 0.8 * swi.length, `The Swing King: full outswingers — forward, ${Math.round(100 * wide / swi.length)}% wide enough to leave (tests leaving outside off)`);
  ok(mag.every(x => x.g.opt.varn === 'Googly' && x.g.opt.seam > 0), 'The Magician’s googly turns in to a right-hander (opposite to his leg-break)');
  ok(exp.every(x => x.g.opt.varn === 'Slower ball' && x.g.kph <= 111 && x.g.kph >= 99 && footFor(x.tr) === 'F'), 'The Express’s slower ball: 12–18 kph slower and pitched up');
}

console.log('— badges reward real skills only —');
{
  const db = newDB(), mk = (o) => Object.assign({ fe: 'B', fv: 'good', v: 'good', ok: true, sc: 1, cat: 'Short', mode: 1 }, o);
  const s1 = { kind: 'session', n: 12, score: 90, balls: [...Array.from({ length: 10 }, () => mk({})), mk({ fe: 'F', cat: 'Full' })] };
  db.sessions.push(s1);
  let got = checkBadges(db, s1, new Date(2026, 9, 26));
  ok(got.includes('first') && got.includes('back10') && !got.includes('fwd10'), '10 short balls in a row read right → Back in Time');
  ok(checkBadges(db, s1, new Date(2026, 9, 26)).length === 0, 'a badge is awarded once');
  const s2 = { kind: 'session', n: 10, score: 50, balls: Array.from({ length: 10 }, () => mk({ fe: 'F', cat: 'Full', fv: 'warn', v: 'warn', ok: false, guess: true, sc: 0.5 })) };
  ok(!checkBadges(newDB(), s2).includes('fwd10'), 'guessed (correct-foot) balls never count toward a badge');
  const s3 = { kind: 'daily', n: 34, score: 85, balls: [...Array.from({ length: 28 }, () => mk({ seg: 1 })), ...Array.from({ length: 6 }, () => mk({ seg: 2 }))] };
  ok(checkBadges(newDB(), s3).includes('pressure6'), '6/6 in the pressure over → Pressure Proof');
  const s4 = Object.assign({}, s3, { balls: s3.balls.map((b, i) => i === 30 ? mk({ seg: 2, ok: false, fv: 'bad', v: 'bad', sc: 0 }) : b) });
  ok(!checkBadges(newDB(), s4).includes('pressure6'), '5/6 is not enough');
  const db2 = newDB(); db2.career.tier = 5; ok(checkBadges(db2, null).includes('selected'), 'reaching India A → Selected');
  ok(new Set(BADGES.map(b => b.id)).size === BADGES.length, `${BADGES.length} badges, unique ids`);
}
// ---------- sync between phone and PC ----------
{
  const ses = (d, n = 10) => ({ date: d, kind: 'session', n, score: 80, balls: Array.from({ length: n }, () => ({ ok: true, sc: 1 })) });
  const phone = newDB(), pc = newDB();
  phone.sessions = [ses('2026-10-20T10:00:00Z'), ses('2026-10-22T10:00:00Z')]; phone.level = 5; phone.levelAt = '2026-10-22T10:10:00Z';
  phone.badges = { first: '2026-10-20T10:20:00Z' }; phone.career.tier = 2; phone.bosses = { b1: 70 };
  phone.rtBase = 0.30; phone.settings.calib = { portrait: { hCm: 15 } }; phone.settings.maxKph = 100;
  pc.sessions = [ses('2026-10-21T18:00:00Z'), ses('2026-10-22T10:00:00Z')]; pc.level = 8; pc.levelAt = '2026-10-25T18:00:00Z';
  pc.badges = { first: '2026-10-21T18:20:00Z', back10: '2026-10-25T18:00:00Z' }; pc.career.tier = 1; pc.bosses = { b1: 85, b2: 60 };
  pc.career.trials = [{ date: '2026-10-25T18:30:00Z', boss: 'b2', score: 60, passed: false }];
  pc.rtBase = 0.262; pc.settings.calib = { portrait: { hCm: 59.8 } }; pc.settings.maxKph = 120;
  const toPC = JSON.parse(JSON.stringify(syncPayload(phone)));     // phone pushes, PC pulls
  const r = mergeSynced(pc, toPC);
  ok(r.sessions === 1 && pc.sessions.length === 3, 'sync: sessions are combined, the shared one is not doubled');
  ok(pc.sessions.map(s => s.date).join() === [...pc.sessions.map(s => s.date)].sort().join(), 'sync: sessions stay in date order');
  ok(pc.level === 8, 'sync: the level changed most recently (PC) wins');
  ok(pc.rtBase === 0.262 && pc.settings.calib.portrait.hCm === 59.8 && pc.settings.maxKph === 120, 'sync: reaction time, calibration and settings stay per device');
  ok(pc.badges.first === '2026-10-20T10:20:00Z' && pc.badges.back10, 'sync: badges combined, first date kept');
  ok(pc.career.tier === 2 && pc.bosses.b1 === 85 && pc.bosses.b2 === 60, 'sync: career tier and boss bests take the best of both');
  const toPhone = JSON.parse(JSON.stringify(syncPayload(pc)));     // PC pushes the merged data, phone pulls
  mergeSynced(phone, toPhone);
  ok(phone.sessions.length === 3 && phone.level === 8 && phone.career.trials.length === 1 && phone.rtBase === 0.30, 'sync: phone ends with the same shared data, keeps its own reaction time');
  const again = mergeSynced(phone, toPhone);
  ok(again.sessions === 0 && !again.level && phone.sessions.length === 3, 'sync: merging twice adds nothing');
  let threw = false; try { mergeSynced(newDB(), { app: 'other' }); } catch (e) { threw = true; } ok(threw, 'sync: a foreign file is refused');
  const big = newDB(); big.sessions = Array.from({ length: 60 }, (_, i) => ses(new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), 400));
  const p = syncPayload(big, 200_000);
  ok(JSON.stringify(p).length < 230_000 && p.data.sessions.length === 60 && big.sessions[0].balls.length === 400, 'sync: a big history is trimmed for upload (copy only, all sessions kept)');
}
done();
